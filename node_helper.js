/* A MagicMirror module to show bus, luas and rail arrival times.
 * Copyright (C) 2017 Raphael Estrada
 * http://raph.es/project/rtpi
 * License: GNU General Public License */

var NodeHelper = require("node_helper");
var RTPIFetcher = require("./rtpifetcher.js");

module.exports = NodeHelper.create({

    start: function() {
        var events = [];
        this.fetchers = [];
        console.log("Starting node helper for: " + this.name);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "ADD_RTPI_STOP") {
            //console.log("ADD_RTPI_STOP:");
            //console.log(payload);
            this.createFetcher(payload.stopId,
                               payload.fetchInterval,
                               payload.routes,
                               payload.directions,
                               payload.destinations,
                               payload.maximumEntries,
                               payload.maximumNumberOfMinutes);
        }
    },

    /* Creates a fetcher for a new stopId if it doesn't exist yet.
     * Otherwise it reuses the existing one.
     *
     * attribute stopId int - id of the stop.
     * attribute fetchInterval number - Interval for getting new data for this stop.
     * attribute routes - the routes to filter for at this stop.
     * attribute directions - the directions to filter for at this stop.
     * attribute maximumEntries - the max number of events to fetch for this stop.
     * attribute maximumNumberOfMinutes - the max due time for events to show for this stop.
     */
    createFetcher: function(stopId, fetchInterval, routes, directions, destinations, maximumEntries, maximumNumberOfMinutes) {
        //console.log("DublinRTPI createFetcher()");
        var self = this;

        var fetcher;
        if (typeof self.fetchers[stopId] === "undefined") {
            console.log("Create new RTPI fetcher for stopId: " + stopId + " - Interval: " + fetchInterval);
            fetcher = new RTPIFetcher(stopId, fetchInterval, routes, directions, destinations, maximumEntries, maximumNumberOfMinutes);

            fetcher.onReceive(function(fetcher) {
                //console.log('Fetcher onReceive()');
                //console.log(fetcher.events());

                self.sendSocketNotification("RTPI_EVENTS", {
                    stopId: fetcher.stopId(),
                    events: fetcher.events()
                });
            });

            fetcher.onError(function(fetcher, error) {
                self.sendSocketNotification("FETCH_ERROR", {
                    stopId: fetcher.stopId(),
                    error: error
                });
            });

            self.fetchers[stopId] = fetcher;
        } else {
            //console.log('Use existing fetcher for stopId: ' + stopId);
            fetcher = self.fetchers[stopId];
            fetcher.broadcastEvents();
        }

        fetcher.startFetch();
    }
});
