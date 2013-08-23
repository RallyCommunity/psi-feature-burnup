var peRecords = [];

Ext.define("MyBurnCalculator", {
   extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",
   
    getMetrics: function () {
       return [
           {
               field: "LeafStoryPlanEstimateTotal",
               as: "Planned Points",
               display: "line",
               f: "sum",
           },
           {
               field: "CalcPreliminaryEstimate",
               as: "PreliminaryEstimate",
               display: "line",
               f: "sum",
           },
           {
               field: "AcceptedLeafStoryPlanEstimateTotal",
               as: "Accepted Points",
               display: "line",
               f: "sum",
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
        fetch: ['Name', 'ObjectID', 'Project', 'ReleaseStartDate', 'ReleaseDate' ],
        filters: [],
        listeners: {
        load: function(store, releaseRecords) {
            
            // given a list of all releases (accross sub projects)
            var releases = _.map( releaseRecords, function(rec) { return { name : rec.get("Name"), objectid : rec.get("ObjectID")};});
            
            // get a unique list by name to display in combobox        
            releases = _.uniq( releases, function (r) { return r.name; });
            // create a store with the set of unique releases
            var releasesStore = Ext.create('Ext.data.Store', {
                fields: ['name','objectid'],data : releases 
            });
          
            // construct the combo box using the store
            var cb = Ext.create("Ext.ux.CheckCombo", {
                fieldLabel: 'Release',
                store: releasesStore,
                queryMode: 'local',
                displayField: 'name',
                valueField: 'name',
                noData : true,
                width: 300,
                
                listeners : {
                    scope : this,
                    // after collapsing the list
                    collapse : function ( field, eOpts ) {
                        var releases = [];
                        // for each selected release name, select all releases with that name and grap the object id and push it into an 
                        // array. The result will be an array of all matching release that we will use to query for snapshots.
                        _.each( field.getValue().split(","), function (rn) {
                            _.each( _.filter( releaseRecords, function(r) { return rn == r.get("Name"); }),
                                function(rel) { releases.push(rel); }
                            );
                        });
                        this.querySnapshots(releases);
                    }
                }
            });
            this.add(cb);
          },
          scope: this
        }
      });
    
    },
    
    querySnapshots : function(releases) {
        
        var ids = _.pluck(releases, function(release) { return release.get("ObjectID");} );
        this.chartConfig.storeConfig.find['Release'] = { "$in": ids };

        var start = _.min(_.pluck(releases,function(r) { return r.get("ReleaseStartDate");}));
        var end   = _.max(_.pluck(releases,function(r) { return r.get("ReleaseDate");}));
        
        console.log("start",start);
        console.log("end"  ,end);
        
        this.chartConfig.calculatorConfig.startDate = start;
        this.chartConfig.calculatorConfig.endDate = end;

        var chart = this.down("#myChart");
        if (chart!=null) {
            this.remove(chart); 
        }
        this.add(this.chartConfig);
        
    },
    
    chartConfig: {
        xtype: 'rallychart',
        itemId : 'myChart',
        chartColors: ['Gray', 'Orange', 'Green', '#3A874F'],

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
        },

        chartConfig: {
            
            colors : [],
            
            chart: {
                colors : [],
                zoomType: 'xy'
            },
            title: {
                text: 'Feature Burnup'
            },
            xAxis: {
                tickInterval: 7,
                labels: {
                    formatter: function() {
                        var d = new Date(this.value);
                        return ""+(d.getMonth()+1)+"/"+d.getDate();
                    }
                },
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
                line : {lineWidth : 1},
                series: {
                    marker: {
                        enabled: true
                    }
                },
            }
        }
    }
    
    
});
