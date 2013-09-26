var peRecords = [];
var acceptedData = [];

Ext.define("MyBurnCalculator", {
   extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",
   
    getMetrics: function () {
        var metrics = [
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
        return metrics;
    },
    getDerivedFieldsOnInput : function () { 
        // XS 1, S 3, M 5, L 8, XL 13
        return [ 
            {
                as: 'CalcPreliminaryEstimate', 
                f:  function(row) {
                    var r = _.find(peRecords, function(rec) { return rec.get("ObjectID") == row.PreliminaryEstimate; });
                    return r !== undefined ? r.get("Value") : 0;    
                }
            },
            {
                as: 'Completed', 
                f:  function(row) {
                return row.PercentDoneByStoryCount == 1 ? 1 : 0;
                }
            }
        ];
    },
    getDerivedFieldsAfterSummary : function () {
        return [
            {as: 'Projection', 
            f: function (row, index, summaryMetrics, seriesData) {
                if (index === 0) {
                    datesData = _.pluck(seriesData,"label");
                    var today = new Date();
                    var li = datesData.length-1;
                    acceptedData = _.pluck(seriesData,"Accepted Points");
                    acceptedData = _.filter(acceptedData, function(d,i) { return new Date(Date.parse(datesData[i])) < today; });
                }
                var y = linearProject( acceptedData, index);
                return Math.round(y * 100) / 100;
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

        this.project = this.getContext().getProject().ObjectID;

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
        
        console.log("Selected Releases:",name);
    
        return Ext.create('Rally.data.WsapiDataStore', {
        autoLoad: true,
        model: 'Release',
        limit : 'Infinity',
        fetch: ['Name', 'ObjectID', 'Project', 'ReleaseStartDate', 'ReleaseDate' ],
        filters: [],
        listeners: {
        load: function(store, releaseRecords) {

            // given a list of all releases (accross sub projects)
            var releases = _.map( releaseRecords, function(rec) { return { name : rec.get("Name"), objectid : rec.get("ObjectID"), releaseDate : new Date(Date.parse(rec.get("ReleaseDate")))};});
            // get a unique list by name to display in combobox        
            releases = _.uniq( releases, function (r) { return r.name; });
            releases = _.sortBy( releases, function(rec) {return rec.releaseDate;}).reverse();
            // create a store with the set of unique releases
            var releasesStore = Ext.create('Ext.data.Store', {
                fields: ['name','objectid'], data : releases 
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
                        this.queryFeatures(releases);
                    }
                }
            });
            this.add(cb);
          },
          scope: this
        }
      });
    
    },
    
    queryFeatures : function(releases) {
        // get Features for the selected release(s)
        var that = this;
        var uniqReleases = _.uniq(releases,function(release) { return release.get("Name");});
        var filter = null;
        _.each(uniqReleases,function(release,i) {
            var f = Ext.create('Rally.data.QueryFilter', {
                property: 'Release.Name',
                operator: '=',
                value: release.get("Name")});

            filter = i == 0 ? f : filter.or(f);
        });
        
        console.log("filter:",filter.toString());

        return Ext.create('Rally.data.WsapiDataStore', {
            autoLoad: true,
            model: 'PortfolioItem/Feature',
            limit : 'Infinity',
            fetch: ['ObjectID','FormattedID' ],
            filters: [filter],
            listeners: {
                load: function(store, features) {
                    console.log("# of features in chart:",features.length);
                    that.createChart(features,uniqReleases);
                }
            }
        });        
    },

    createChart : function (features,releases) {
        console.log("project",this.project);        
        var ids = _.pluck(features, function(feature) { return feature.get("ObjectID");} );
        
        var start = _.min(_.pluck(releases,function(r) { return r.get("ReleaseStartDate");}));
        var end   = _.max(_.pluck(releases,function(r) { return r.get("ReleaseDate");}));
        
        var isoStart  = Rally.util.DateTime.toIsoString(start, false);
        console.log("start",start);
        console.log("end"  ,end);

        this.chartConfig.storeConfig.find['ObjectID'] = { "$in": ids };
        this.chartConfig.storeConfig.find['_ProjectHierarchy'] = { "$in": this.project };
        //this.chartConfig.storeConfig.find['_ValidTo'] = { "$gte" : isoStart  };
        //this.chartConfig.storeConfig.find['$or'] = [ {'__At' : 'current'},{ "_ValidTo" : { "$gte" : isoStart  }}];

        this.chartConfig.calculatorConfig.startDate = start;
        this.chartConfig.calculatorConfig.endDate = end;

        var chart = this.down("#myChart");
        if (chart!==null) {
             this.remove(chart); 
        }
        this.add(this.chartConfig);
        //var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', this.chartConfig.storeConfig);

    },
    
    chartConfig: {
        xtype: 'rallychart',
        itemId : 'myChart',
        chartColors: ['Gray', 'Orange', 'Green', 'Blue','Green','LightGray'],
        
        storeConfig: {
            listeners: {
                scope : this,
                load: function(store, features, success) {
                    console.log("2nd call features",features.length);
                }
            },
            find : {
                '_TypeHierarchy' : { "$in" : ["PortfolioItem/Feature"] }
            },
            autoLoad : true,
            pageSize:1000,
            limit: 'Infinity',
            fetch: ['ObjectID','_TypeHierarchy','PreliminaryEstimate', 'LeafStoryPlanEstimateTotal','AcceptedLeafStoryPlanEstimateTotal','PercentDoneByStoryCount'],
            hydrate: ['_TypeHierarchy']
		},
        
        calculatorType: 'MyBurnCalculator',
        
        calculatorConfig: {
            
        },

        chartConfig: {

            plotOptions: {
                series: {
                    marker: {
                        radius: 2
                    }
                }
            },
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
            ]
        }
    }

    
    
});
