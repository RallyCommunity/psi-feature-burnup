/** this class will return a set of features which are parented to a specified set of 
  *  portfolio items.
**/
Ext.define("FeaturesForPortfolioQueryStrategy", function() {

    var self;

    return {

        extend : "FeaturesForParentStrategy",

        config : {
            featureType : "",
            parentQueryType : "",
            parentQuery : "",
            context : ""
        },

        constructor:function(config) {
            self = this;
            this.initConfig(config);
            // this.mergeConfig(config);
            this.callParent([this.config]);
            return this;
        },

        // createTitle : function( parents ) {
        //     var title = "Burnup for Portfolio Items (" + _.map(parents,function(p){return p.get("FormattedID");}) + ")";
        //     return title
        // },

        readFeatures : function(callback) {

            self.getParents(self.parentQueryType, self.parentQuery, function(parents,error) {
                var oids = _.map(parents,function(i){return i.get("ObjectID");});
                // console.log("parentOids",oids);
                self.findFeatureSnapShots(oids,function(snapshots) {
                    var featureIds = _.map(snapshots,function(s) { return s.get("ObjectID")});
                    if (snapshots.length===0) {
                        callback( null, "No features found for selected parents");
                        return;
                    } 
                    self.getFeatures(featureIds,function(features) {
                        // console.log("features",features);
                        var extent = self.getPortfolioItemExtent(parents);
                        if (!extent.valid) {
                            callback(null,"At least one of the portfolio items selected must have a planned start and end date set to define the chart date range");
                            return;
                        }
                        self.getIterations(extent,function(iterations) {
                            callback( { features : features, extent : extent, iterations : iterations, title : self.createTitle(parents) }, error);
                        });

                    });
                });
            });

        },

        // read parent items based on parent query
        // find all feature snapshots parented to those items.
        // real all the wsapi features

        getParents : function( parentType, parentQuery, callback) {

            var filter = Ext.create('TSStringFilter', { query_string:parentQuery } );
            // console.log("Filter:",filter.toString());
        
            Ext.create('Rally.data.WsapiDataStore',{
                model: parentType,
                autoLoad: true,
                limit: 'Infinity',
                filters: filter,
                fetch: ['FormattedID','ObjectID','PlannedStartDate','PlannedEndDate'],
                listeners: {
                    scope: this,
                    load: function(store,items,successful,opts){
                        if ( successful ) {
                            // console.log("items",items);
                            callback(items);
                        } else {
                            callback(null,("Error loading filter"));
                        }
                    }
                }
            });
        }

    }
});


