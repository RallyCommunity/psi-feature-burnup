var peRecords = [];

Ext.define("MyBurnCalculator", {
   extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",
   
    getMetrics: function () {
       return [
           {
               field: "LeafStoryPlanEstimateTotal",
               as: "Planned Points",
               display: "line",
               f: "sum"
           },
           {
               field: "CalcPreliminaryEstimate",
               as: "PreliminaryEstimate",
               display: "line",
               f: "sum"
           },
           {
               field: "AcceptedLeafStoryPlanEstimateTotal",
               as: "Accepted Points",
               display: "line",
               f: "sum"
           },
            {
               field: "ObjectID",
               as: "Count",
               display: "column",
               f: "count"
            },
            {
               field: "Completed",
               as: "Completed",
               display: "column",
               f: "sum"
            }


       ];
    },
    getDerivedFieldsOnInput : function () { 
        // XS 1, S 3, M 5, L 8, XL 13
        return [ 
            {
                as: 'CalcPreliminaryEstimate', 
                f:  function(row) {
                    var r = _.find(peRecords, function(rec) { return rec.get("ObjectID") == row["PreliminaryEstimate"] });
                    return r != undefined ? r.get("Value") : 0;    
                }
            },
            {
                as: 'Completed', 
                f:  function(row) {
                return row['PercentDoneByStoryCount'] == 1 ? 1 : 0;
                }
            }
        ];
    },
   defined : function(v) {
        return (!_.isUndefined(v) && !_.isNull(v));            
    }
   
});



Ext.define('CustomApp', {
    scopeType: 'release',
    extend: 'Rally.app.App',
    componentCls: 'app',

    launch: function() {
        console.log("launch");
        var timeboxScope = this.getContext().getTimeboxScope();
        var tbName = null;
        if(timeboxScope) {
            var record = timeboxScope.getRecord();
            tbName = record.get('Name');
        } else {
            tbName = "";
        }
        
        var peStore = Ext.create('Rally.data.WsapiDataStore', {
            autoLoad: true,
            model: 'PreliminaryEstimate',
            fetch: ['Name', 'ObjectID', 'Value'],
            filters: [],
            listeners: {
                scope : this,
                load: function(store, data) {       
                    peRecords = data;
                    console.log(peRecords);
                    this.peRecords = peRecords;
                    this.queryReleases(tbName);
                }
            }
        });
    },
    
    queryReleases : function(name) {
    
        var releaseStore;
        return releaseStore = Ext.create('Rally.data.WsapiDataStore', {
        autoLoad: true,
        model: 'Release',
        fetch: ['Name', 'ObjectID', 'Project'],
        filters: [],
        listeners: {
        load: function(store, releaseRecords) {
              
        var releases = _.map( releaseRecords, function(rec) { return { name : rec.get("Name"), objectid : rec.get("ObjectID")};});
        releases = _.uniq( releases, function (r) { return r.name; });
        var releasesStore = Ext.create('Ext.data.Store', {
            fields: ['name','objectid'],
            data : releases });
          
            var cb = Ext.create("Ext.ux.CheckCombo", {
                fieldLabel: 'Choose Release',
                store: releasesStore,
                queryMode: 'local',
                displayField: 'name',
                valueField: 'name',
                noData : true,
                
                listeners : {
                    scope : this,
                    select: function(combo, record, index) {
                        //console.log(this.getValue());
                    },
                    collapse : function ( field, eOpts ) {
                        console.log(field.getValue());
                        var releaseIDs = [];
                        _.each( field.getValue().split(","), function (rn) {
                            _.each( _.filter( releaseRecords, function(r) { return rn == r.get("Name"); }),
                                function(rel) { releaseIDs.push( rel.get("ObjectID"));}
                            );
                        });
                        console.log(releaseIDs);
                        this.querySnapshots(releaseIDs);
                    }
                }
            });
            this.add(cb);
              
            var releaseIDs = _.pluck(releaseRecords, function(rec) {return rec.get("ObjectID");});
            console.log(releaseIDs);
            return _.each(releaseRecords, function(releaseRecord) {
              return this.processRelease(releaseRecord);
            }, this);
          },
          scope: this
        }
      });
    
    },
    
    querySnapshots : function(ids) {
        
        //this.chartConfig.storeConfig.find['_TypeHierarchy'] = { "$in" : "PortfolioItem/Feature" };
        this.chartConfig.storeConfig.find['Release']        = { "$in": ids };
        
        var chart = this.down("#myChart");
        if (chart!=null) {
            this.remove(chart); 
        }
        this.add(this.chartConfig);
        
    },
    
    releaseSnapShotData : function( data ) {
        console.log("data",data);
    },
    
    processRelease : function(rec) {
        console.log(rec)
    },
    
    chartConfig: {
        xtype: 'rallychart',
        itemId : 'myChart',

        storeConfig: {
            find : {
                '_TypeHierarchy' : { "$in" : ["PortfolioItem/Feature"] }
            },
            autoLoad : true,
            limit: Infinity,
            fetch: ['ObjectID','Name', '_TypeHierarchy','PreliminaryEstimate', 'LeafStoryPlanEstimateTotal','AcceptedLeafStoryPlanEstimateTotal','PercentDoneByStoryCount'],
            hydrate: ['_TypeHierarchy','PreliminaryEstimate']
		},
        calculatorType: 'MyBurnCalculator',
        calculatorConfig: {
            preliminaryEstimates : this.peRecords
        },

        chartConfig: {
            chart: {
                zoomType: 'xy'
            },
            title: {
                text: 'Feature Burnup'
            },
            xAxis: {
                tickmarkPlacement: 'on',
                tickInterval: 20,
                title: {
                    text: 'Days'
                }
            },
            yAxis: [
                {
                    title: {
                        text: 'Points'
                    }
                }
            ],
            plotOptions: {
                series: {
                    marker: {
                        enabled: true
                    }
                },
            }
        }
    }
    
    
});
