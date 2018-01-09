/* A MagicMirror module to show bus, luas and rail arrival times.
 * Copyright (C) 2017 Raphael Estrada
 * http://raph.es/project/rtpi
 * License: GNU General Public License */

var request = require('request');

var RTPIFetcher = function(stopId, fetchInterval, routes, directions, destinations, maximumEntries, maximumNumberOfMinutes) {
    var self = this;

    var reloadTimer = null;
    var events = [];

    var fetchFailedCallback = function() {};
    var eventsReceivedCallback = function() {};

    /* fetches the data from RTPI API */
    var fetchStop = function() {

        clearTimeout(reloadTimer);
        reloadTimer = null;

        var apiUrl = "https://data.dublinked.ie/cgi-bin/rtpi/realtimebusinformation?stopid=" + stopId;
        request(apiUrl, function (err, response, body) {
            var newEvents = [];
            var data = {};

            /* handle HTTP errors */
            if (err) {
                console.error("DublinRTPI error querying RTPI API for stop id: " + stopId);
                console.error(err);
                fetchFailedCallback(self, err);
                scheduleTimer();
                return;
            }

            /* handle JSON errors */
            try {
                data = JSON.parse(body);
                //console.log(data);
            } catch (e) {
                console.error("DublinRTPI Error parsing RTPI JSON response for stop id: " + stopId);
                console.error(e);
                console.log(body);
                fetchFailedCallback(self, e);
                scheduleTimer();
                return;
            }

            /* handle RTPI errors */
            switch (data.errorcode) {
            case "0":
                /* no errors */
                break;
            case "1":
                /* valid request, but no data for the stop */
                break;
            default:
                /* error */
                console.error("DublinRTPI RTPI API response has error for stop id: " + stopId + " - " + data.errormessage);
                console.error(data);
                console.log(data);
                fetchFailedCallback(self, e);
                scheduleTimer();
                return;
            }

            /* store the event */
            for (var e in data.results) {
                var event = data.results[e];
                event.stopId = data.stopid;
                event.isDue = event.duetime === "Due";
                event.duetime = event.isDue ? -1 : parseInt(event.duetime);

                if (exclude(event)) {
                    //console.log("excluded event:");
                    //console.log(event);
                    continue;
                }

                newEvents.push(event);
                //console.log(e);
            }

            /* sort by duetime */
            newEvents.sort(function(a, b) {
                return a.duetime - b.duetime;
            });

            /* limit number of events */
            events = newEvents.slice(0, maximumEntries);
            //console.log(newEvents);

            /* notify */
            self.broadcastEvents();
            scheduleTimer();
        });
    };

    /* Filters out events based on the user config */
    var exclude = function(event) {
        return excludeDueTime(event) || excludeRoute(event) || excludeDirection(event) || excludeDestination(event);
    };

    /* exclude if the duetime is beyond the configured limit.
     * never exclude if no max was configured. */
    var excludeDueTime = function(event) {
        if (!maximumNumberOfMinutes) { return false; }
        return event.duetime > maximumNumberOfMinutes;
    };

    /* exclude a route unless it matches exactly a value configured.
     * using substrings to match routes could result in false positives.
     * some routes are substrings of others, i.e. '42' and '42x'
     * never exclude if no routes were configured. */
    var excludeRoute = function(event) {
        if (!routes || !routes.length) { return false; }
        var route = event.route.toLowerCase();
        for (var r in routes) {
            var desiredRoute = routes[r].toLowerCase();
            if (desiredRoute && route === desiredRoute) {
                //console.log("include route: " + route);
                return false;
            }
        }
        return true;
    };

    /* exclude a destination unless it contains a value configured.
     * never exclude if no destinations were configured. */
    var excludeDestination = function(event) {
        if (!destinations || !destinations.length) { return false; }
        var destination = event.destination.toLowerCase();
        for (var d in destinations) {
            var desiredDestination = destinations[d].toLowerCase();
            if (desiredDestination && destination.indexOf(desiredDestination) >= 0) {
                //console.log("include destination: " + destination);
                return false;
            }
        }
        return true;
    };

    /* exclude a direction unless it contains a value configured.
     * never exclude if no directions were configured. */
    var excludeDirection = function(event) {
        if (!directions || !directions.length) { return false; }
        var direction = event.direction.toLowerCase();
        for (var d in directions) {
            var desiredDirection = directions[d].toLowerCase();
            if (desiredDirection && direction.indexOf(desiredDirection) >= 0) {
                //console.log("include direction: " + direction);
                return false;
            }
        }
        return true;
    };

    /* schedule the timer for the next update */
    var scheduleTimer = function() {
        //console.log('Schedule update timer.');
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(function() {
            fetchStop();
        }, fetchInterval);
    };

    /* PUBLIC METHODS */

    /* trigger fetching a stop */
    this.startFetch = function() {
        fetchStop();
    };

    /* Broadcast the existing events */
    this.broadcastEvents = function() {
        //console.log('Broadcasting ' + events.length + ' events.');
        //console.log(events);
        eventsReceivedCallback(self);
    };

    /* Sets the on success callback
     *
     * argument callback function - The on success callback.
     */
    this.onReceive = function(callback) {
        eventsReceivedCallback = callback;
    };

    /* Sets the on error callback
     *
     * argument callback function - The on error callback.
     */
    this.onError = function(callback) {
        fetchFailedCallback = callback;
    };

    /* Returns the stopId of this fetcher.
     *
     * return string - The stopId of this fetcher.
     */
    this.stopId = function() {
        return stopId;
    };

    /* Returns current available events for this fetcher.
     *
     * return array - The current available events for this fetcher.
     */
    this.events = function() {
        return events;
    };
};


module.exports = RTPIFetcher;
