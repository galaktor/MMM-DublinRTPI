/* A MagicMirror module to show bus, luas and rail arrival times.
 * Copyright (C) 2017 Raphael Estrada
 * http://raph.es/project/rtpi
 * License: GNU General Public License */

Module.register("MMM-DublinRTPI", {

    defaults: {
        animationSpeed: 1000,
        broadcastEvents: true,
        colored: false,
        destinations: [],
        directions: [],
        displayDestination: true,
        displayRoute: true,
        displayStopName: true,
        displaySymbol: true,
        fade: true,
        fadePoint: 0.25,
        fetchInterval: 60000,
        maximumEntries: 10,
        maximumNumberOfMinutes: 60,
        routes: [],
        stops: []
    },

    getStyles: function () {
        return ["dublinrtpi.css", "font-awesome.css"];
    },

    getScripts: function () {
        return [];
    },

    getTranslations: function () {
        return false;
    },

    /* initialize */
    start: function () {
        Log.log("Starting module: " + this.name);

        for (var s in this.config.stops) {
            var stop = this.config.stops[s];

            /* RTPI uses lowercase letters, so we need to
             * ensure the IDs in our config are lowercase */
            if (stop.id) {
                stop.id = stop.id.toLowerCase();
            }

            /* if no individual symbols were defined, set
             * the default ones here based on the stop id */
            if (!stop.symbol) {
                stop.symbol = this.defaultSymbolForStop(stop.id);
            }

            this.addStop(stop);
        }

        this.stopData = {};
        this.loaded = false;
    },

    /* handle notifications */
    socketNotificationReceived: function (notification, payload) {
        if (notification === "RTPI_EVENTS") {
            if (this.hasStopId(payload.stopId)) {
                this.stopData[payload.stopId] = payload.events;
                this.loaded = true;

                if (this.config.broadcastEvents) {
                    this.broadcastEvents();
                }
            }
        } else if (notification === "FETCH_ERROR") {
            Log.error("DublinRTPI Error. Could not fetch stop: " + payload.stopId);
        } else {
            Log.log("DublinRTPI received an unknown socket notification: " + notification);
        }

        this.updateDom(this.config.animationSpeed);
    },

    /* build the HTML to render */
    getDom: function () {

        var events = this.createEventList();
        //console.log(events);
        var wrapper = document.createElement("table");
        wrapper.className = "small";

        if (events.length === 0) {
            wrapper.innerHTML = (this.loaded) ? this.translate("EMPTY") : this.translate("LOADING");
            wrapper.className = "small dimmed";
            return wrapper;
        }

        for (var e in events) {
            var event = events[e];
            //console.log(event);
            var eventWrapper = document.createElement("tr");

            if (this.config.colored) {
                eventWrapper.style.cssText = "color:" + this.colorForStop(event.stopId);
            }

            eventWrapper.className = "normal";

            /* symbol */
            if (this.config.displaySymbol) {
                var symbolWrapper = document.createElement("td");
                symbolWrapper.className = "symbol align-right";
                var symbol = document.createElement("span");
                symbol.className = "fa fa-fw fa-" + this.symbolForStop(event.stopId);
                //console.log(symbol.className);
                symbol.style.paddingLeft = "5px";
                symbolWrapper.appendChild(symbol);
                eventWrapper.appendChild(symbolWrapper);
            }

            /* stop name */
            if (this.config.displayStopName) {
                var stopNameWrapper = document.createElement("td");
                stopNameWrapper.className = this.config.colored ? "stopname" : "stopname bright";
                stopNameWrapper.innerHTML = this.nameForStop(event.stopId);
                eventWrapper.appendChild(stopNameWrapper);
            }

            /* route */
            if (this.config.displayRoute) {
                var routeWrapper = document.createElement("td");
                routeWrapper.className = this.config.colored ? "route" : "route bright";
                routeWrapper.innerHTML = event.route;
                eventWrapper.appendChild(routeWrapper);
            }

            /* destination */
            if (this.config.displayDestination) {
                var lineWrapper = document.createElement("td");
                lineWrapper.className = this.config.colored ? "destination" : "destination bright";
                lineWrapper.innerHTML = event.destination;
                eventWrapper.appendChild(lineWrapper);
            }

            var timeWrapper = document.createElement("td");
            timeWrapper.innerHTML = event.isDue ? "Due" : event.duetime + " min";
            //console.log(event.duetime);
            //console.log(event);
            timeWrapper.className = "time light";
            eventWrapper.appendChild(timeWrapper);

            wrapper.appendChild(eventWrapper);

            /* fade effect */
            if (this.config.fade && this.config.fadePoint < 1) {
                if (this.config.fadePoint < 0) {
                    this.config.fadePoint = 0;
                }
                var startingPoint = events.length * this.config.fadePoint;
                var steps = events.length - startingPoint;
                if (e >= startingPoint) {
                    var currentStep = e - startingPoint;
                    eventWrapper.style.opacity = 1 - (1 / steps * currentStep);
                }
            }
        }

        return wrapper;
    },

    /* Check if this config contains the stop ID.
     *
     * argument stopId string - stop ID to look for.
     *
     * return bool - The config has this stop ID
     */
    hasStopId: function (stopId) {
        for (var s in this.config.stops) {
            var stop = this.config.stops[s];
            if (stop.id === stopId) {
                return true;
            }
        }

        return false;
    },

    /* Creates the sorted list of all events.
     *
     * return array - Array with events.
     */
    createEventList: function () {
        var events = [];
        for (var s in this.stopData) {
            var stop = this.stopData[s];
            for (var e in stop) {
                events.push(stop[e]);
            }
        }

        events.sort(function (a, b) {
            return a.duetime - b.duetime;
        });

        return events.slice(0, this.config.maximumEntries);
    },

    /* Requests node helper to add a stop.
     *
     * argument stopConfig object - Configuration for the stop to add.
     */
    addStop: function (stopConfig) {
        Log.log("DublinRTPI adding stop id: " + stopConfig.id);
        //console.log("addStop() " + stopConfig.id);
        this.sendSocketNotification("ADD_RTPI_STOP", {
            stopId: stopConfig.id,
            directions: stopConfig.directions || this.config.directions,
            routes: stopConfig.routes || this.config.routes,
            destinations: stopConfig.destinations || this.config.destinations,
            maximumEntries: stopConfig.maximumEntries || this.config.maximumEntries,
            maximumNumberOfMinutes: stopConfig.maximumNumberOfMinutes || this.config.maximumNumberOfMinutes,
            fetchInterval: stopConfig.fetchInterval || this.config.fetchInterval
        });
    },

    /* Detects an appropriate default symbol based on the stop ID.
     * - Luas stop IDs always start with 'luas' followed by digits
     * - Rail stop IDs are always alphabetical
     * - Bus stop IDs are always numerical
     * source: https://data.dublinked.ie/cgi-bin/rtpi/busstopinformation
     *
     * argument stopId - The stop ID to match a symbol to
     *
     * return string - The symbol for the stop.
     */
    defaultSymbolForStop: function(stopId) {
        if(stopId.match(/^luas\d+$/)) {
            return "subway"; // https://fontawesome.com/icons/subway
        } else if (stopId.match(/^[A-z]+$/)) {
            return "train"; // https://fontawesome.com/icons/train
        } else if (stopId.match(/^\d+$/)) {
            return "bus"; // https://fontawesome.com/icons/bus
        } else {
            return "question-circle"; // https://fontawesome.com/icons/question-circle
        }
    },

    /* Retrieves the symbol for a specific stop ID.
     *
     * argument stopId string - The stop ID to look for.
     *
     * return string - The symbol for the stop.
     */
    symbolForStop: function (stopId) {
        return this.getStopProperty(stopId, "symbol", this.defaultSymbolForStop(stopId));
    },

    /* Retrieves the name for a specific stop ID.
     *
     * argument stopId string - The stop ID to look for.
     *
     * return string - The custom label if present, or the stop ID.
     */
    nameForStop: function (stopId) {
        return this.getStopProperty(stopId, "label", stopId);
    },

    /* Retrieves the color for a specific stop ID.
     *
     * argument stopId string - The stop ID to look for.
     *
     * return string - The color for the stop.
     */
    colorForStop: function (stopId) {
        return this.getStopProperty(stopId, "color", "#fff");
    },

    /* Helper method to retrieve the property for a specific stop.
     *
     * argument stopId string - The stop ID to look for.
     * argument property string - The property to look for.
     * argument defaultValue string - Value if property is not found.
     *
     * return string - The value of the property on the stop.
     */
    getStopProperty: function (stopId, property, defaultValue) {
        //console.log("getStopProperty()");
        for (var s in this.config.stops) {
            var stop = this.config.stops[s];
            if (stop.id === stopId && stop.hasOwnProperty(property)) {
                //console.log("getStopProperty(" + stopId + ", ", + property + ", " + defaultValue + "): " + stop[property]);
                return stop[property];
            }
        }
        return defaultValue;
    },


    /* Broadcasts the events to all other modules for reuse.
     * The all events available in one array, sorted on duetime.
     */
    broadcastEvents: function () {
        var eventList = [];
        for (var stopId in this.stopData) {
            var stop = this.stopData[stopId];
            for (var e in stop) {
                var event = cloneObject(stop[e]);
                event.symbol = this.symbolForStop(stopId);
                event.color = this.colorForStop(stopId);
                eventList.push(event);
            }
        }

        eventList.sort(function(a, b) {
            return a.duetime - b.duetime;
        });

        this.sendNotification("RTPI_EVENTS", eventList);

    }
});
