/** this class will return a set of features which are parented to a specified set of 
  *  portfolio items.
**/
Ext.define("FeaturesForParentStrategy", function() {

    var self;

    return {
        config : {
            portfolioIds : "",
            featureType : "",
            context : ""
        },

        constructor:function(config) {
            self = this;
            this.initConfig(config);
            // trim each value to remove extra spaces
            self.portfolioIds = _.map( self.piArray(), function(s) { return s.trim(); } ).join(",");
            // console.log(self.portfolioIds);
            return this;
        },

        createTitle : function( parents ) {
            var title = "Burnup for Portfolio Items (" + 
                _.first( _.map(parents,function(p){return p.get("FormattedID");}),4) +
                (parents.length>4?"...":"") +
                ")";
            return title
        },

        piArray : function() {
            return self.portfolioIds.split(",");
        },

        readFeatures : function(callback) {

            Ext.create('Rally.data.WsapiDataStore', {
                autoLoad: true,
                model : "portfolioitem",
                limit : 'Infinity',
                fetch: ['ObjectID','FormattedID','PlannedStartDate','PlannedEndDate'],
                filters: [self.createPIFilter(self.piArray(),"FormattedID")],
                listeners: {
                    load: function(store, parents) {
                        // console.log("Loaded:"+parents.length," Parents",parents);
                        // workaround because wsapi return objects of all types
                        parents = _.filter(parents,function(parent) {
                            return (_.indexOf( self.portfolioIds.split(","), parent.get("FormattedID")) !==-1);
                        });                       
                        // console.log("Loaded:"+parents.length," Parents",parents);

                        // validate that all were found
                        var diff = _.difference( self.piArray(), _.map(parents,function(p) { 
                            return p.get("FormattedID");
                        }));
                        if (diff.length>0) {
                            callback(null,"The following items were not found:" + diff.join(","));
                            return;
                        }

                        var extent = self.getPortfolioItemExtent(parents);
                        if (!extent.valid) {
                            callback(null,"At least one of the portfolio items selected must have a planned start and end date set to define the chart date range");
                            return;
                        }

                        // validate at least one of portfolio items has a start / end date
                        var parentIds = _.map(parents,function(parent) { 
                            return parent.get("ObjectID");
                        });

                        self.getIterations(extent,function(iterations) {
                            self.findFeatureSnapShots(parentIds,function(snapshots) {
                                var featureIds = _.map(snapshots,function(s) { return s.get("ObjectID")});
                                var error = (featureIds.length > 0) ? null : "No features found for selected parents:" + self.piArray().join(",");
                                if (error) {
                                    callback( null, error);
                                    return;
                                }

                                self.getFeatures(featureIds,function(features) {
                                    var error = (features.length > 0) ? null : "No features found for selected parents:" + self.piArray().join(",");
                                    // console.log("features",_.map(features,function(f){return f.get("FormattedID");}));
                                    callback( { 
                                        features : features, 
                                        extent : extent, 
                                        iterations : iterations, 
                                        title : self.createTitle(parents) }, error);
                                });
                            });
                        });
                    }
                }
            });
        },


        createIterationFilter : function(extent) {
            var filter = null;
            var f1 = Ext.create('Rally.data.QueryFilter', {
                property: "StartDate",
                operator: '>=',
                value: extent.isoStart
            });
            var f2 = Ext.create('Rally.data.QueryFilter', {
                property: "EndDate",
                operator: '<=',
                value: extent.isoEnd
            });
            
            var filter = f1.and(f2);
            // console.log("iteration filter:",filter.toString());
            return filter;
        },

        createPIFilter : function(ids,field) {
            var filter = null;
            var idsArray = _.isArray(ids) ? ids : ids.split(",");
            _.each(idsArray, function( id, i) {
                var f = Ext.create('Rally.data.QueryFilter', {
                    property: field,
                    operator: '=',
                    value: id
                });
                filter = i === 0 ? f : filter.or(f);
            });
            // console.log("filter",filter.toString());
            return filter;
        },

        findFeatureSnapShots : function( parentIds, callback ) {

            // console.log("ParentIDs",parentIds, "featureType", self.featureType);
            var storeConfig = {
                find : {
                    '_TypeHierarchy' : { "$in" : [self.featureType] },
                    '_ItemHierarchy' : { "$in" : parentIds },
                    "__At": "current"
                },
                autoLoad : true,
                pageSize:1000,
                limit: 'Infinity',
                fetch: ['ObjectID','_TypeHierarchy'],
                hydrate: ['_TypeHierarchy'],
                listeners : {
                    scope : this,
                    load: function(store, snapshots, success) {
                        // console.log("Loaded:"+snapshots.length," Snapshots.");
                        callback(snapshots);
                    }
                }
            };
            Ext.create('Rally.data.lookback.SnapshotStore', storeConfig);
        },

        // returns the earliest and latest planned start/end dates for the set of items
        getPortfolioItemExtent : function( items ) {
            var startDates = _.compact( _.pluck(items,function(r) { return r.get("PlannedStartDate");}));
            var endDates = _.compact( _.pluck(items,function(r) { return r.get("PlannedEndDate");}));
            var valid = startDates.length>0 && endDates.length > 0;
            var start = _.min(startDates);
            var end   = _.max(endDates);
            var isoStart  = Rally.util.DateTime.toIsoString(start, false);
            var isoEnd    = Rally.util.DateTime.toIsoString(end, false);
            return { start : start, end : end, isoStart : isoStart, isoEnd : isoEnd, valid : valid };
        },

        getIterations : function(extent,callback) {

             Ext.create('Rally.data.WsapiDataStore', {
                autoLoad: true,
                model : "Iteration",
                limit : 'Infinity',
                fetch: ['ObjectID','EndDate','StartDate','Name'],
                filters: [self.createIterationFilter(extent)],
                listeners: {
                    load: function(store, iterations) {
                        // console.log("iterations",iterations);
                        callback(iterations);
                    }
                }
            });
        },

        getFeatures : function(featureIds,callback) {

            var filter = self.createPIFilter(featureIds,"ObjectID");
            
            Ext.create('Rally.data.WsapiDataStore', {
                autoLoad: true,
                model : self.featureType,
                limit : 'Infinity',
                fetch: ['ObjectID','FormattedID'],
                filters: [filter],
                listeners: {
                    load: function(store, features) {
                        callback(features);
                    }
                }
            });
        }

    };
   
});
