var peRecords = [];
var acceptedData = [];
var myMask = null;

Ext.define('CustomApp', {
    scopeType: 'release',
    extend: 'Rally.app.App',
    componentCls: 'app',

    launch: function() {
        console.log("launch");
        // get the project id.
        this.project = this.getContext().getProject().ObjectID;

        // get the release (if on a page scoped to the release)
        var tbName = getReleaseTimeBox(this);

        // get the preliminary estimate values
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
    
    // queries all releases 
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
                    this.createReleaseCombo(releaseRecords);
                },
                scope: this
          },
          
        });
    },
    
    // creates a release drop down combo box with the uniq set of release names
    createReleaseCombo : function(releaseRecords) {
        
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
                    var r = [];
                    console.log(field.getValue());
                    // // for each selected release name, select all releases with that name and grab the object id and push it into an 
                    // // array. The result will be an array of all matching release that we will use to query for snapshots.
                    _.each( field.getValue().split(","), function (rn) {
                        var matching_releases = _.filter( releaseRecords, function(r) { return rn == r.get("Name");});
                        var uniq_releases = _.uniq(matching_releases, function(r) { return r.get("Name"); });
                        _.each(uniq_releases,function(release) { r.push(release) });
                    });
                    console.log("r",r);
                    if (r.length > 0) {
                        myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Please wait..."});
                        myMask.show();
                        this.queryFeatures(r);
                    }
                }
            }
        });
        this.add(cb);
    },
    
    queryFeatures : function(releases) {
        // get Features for the selected release(s)
        var that = this;
        var filter = null;
        _.each(releases,function(release,i) {
            console.log("release",release);
            var f = Ext.create('Rally.data.QueryFilter', {
                property: 'Release.Name',
                operator: '=',
                value: release.get("Name")
            });
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
                    that.createChart(features,releases);
                }
            }
        });        
    },

    createChart1 : function ( features, releases,start,end) {
        var that = this;
        var lumenize = window.parent.Rally.data.lookback.Lumenize;
        var snapShotData = _.map(features,function(d){return d.data});
        // can be used to 'knockout' holidays
        var holidays = [
            {year: 2014, month: 1, day: 1}  // Made up holiday to test knockout
        ];
        var myCalc = Ext.create("MyBurnCalculator");

        // calculator config
        var config = {
            deriveFieldsOnInput: myCalc.getDerivedFieldsOnInput(),
            metrics: myCalc.getMetrics(),
            summaryMetricsConfig: [],
            deriveFieldsAfterSummary: myCalc.getDerivedFieldsAfterSummary(),
            granularity: lumenize.Time.DAY,
            tz: 'America/Chicago',
            holidays: holidays,
            workDays: 'Monday,Tuesday,Wednesday,Thursday,Friday'
        };
        // release start and end dates
        var startOnISOString = new lumenize.Time(start).getISOStringInTZ(config.tz)
        var upToDateISOString = new lumenize.Time(end).getISOStringInTZ(config.tz)
        // create the calculator and add snapshots to it.
        calculator = new lumenize.TimeSeriesCalculator(config);
        calculator.addSnapshots(snapShotData, startOnISOString, upToDateISOString);
        // create a high charts series config object, used to get the hc series data
        var hcConfig = [{ name : "label" }, 
                        { name : "Planned Points" }, 
                        { name : "PreliminaryEstimate"},
                        { name : "Accepted Points"},
                        { name : "Projection"},
                        { name : "Count", type:'column'},
                        { name : "Completed",type:'column'} ];
        var hc = lumenize.arrayOfMaps_To_HighChartsSeries(calculator.getResults().seriesData, hcConfig);
        this._showChart(hc);
    },

    createChart : function (features,releases) {
        
        var ids = _.pluck(features, function(feature) { return feature.get("ObjectID");} );
        var start = _.min(_.pluck(releases,function(r) { return r.get("ReleaseStartDate");}));
        var end   = _.max(_.pluck(releases,function(r) { return r.get("ReleaseDate");}));
        var isoStart  = Rally.util.DateTime.toIsoString(start, false);

        var storeConfig = {
            find : {
                '_TypeHierarchy' : { "$in" : ["PortfolioItem/Feature"] }
            },
            autoLoad : true,
            pageSize:1000,
            limit: 'Infinity',
            fetch: ['ObjectID','_TypeHierarchy','PreliminaryEstimate', 'LeafStoryPlanEstimateTotal','AcceptedLeafStoryPlanEstimateTotal','PercentDoneByStoryCount'],
            hydrate: ['_TypeHierarchy']
		};

        storeConfig.find['ObjectID'] = { "$in": ids };
        storeConfig.find['_ProjectHierarchy'] = { "$in": this.project };
        storeConfig.find['_ValidTo'] = { "$gte" : isoStart  };
        storeConfig.listeners = {
                scope : this,
                load: function(store, features, success) {
                    console.log("2nd call features",features.length);
                    this.createChart1(features,releases,start,end);
                }
        };
        
        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', storeConfig);
    },
    
    _showChart : function(series) {
        var chart = this.down("#chart1");
        myMask.hide();
        if (chart !== null)
            chart.removeAll();
        
        series[1].data = _.map(series[1].data, function(d) { return _.isNull(d) ? 0 : d; });
        
        var extChart = Ext.create('Rally.ui.chart.Chart', {
            itemId : "chart1",
            // width: 800,
            // height: 500,
            chartData: {
                categories : series[0].data,
                series : series.slice(1, series.length)
            },
            chartColors: ['Gray', 'Orange', 'Green', 'LightGray', 'Blue','Green'],

            chartConfig : {
                chart: {
                },
                title: {
                text: 'PSI Feature Burnup',
                x: -20 //center
                },
                plotOptions: {
                    series: {
                        marker: {
                            radius: 2
                        }
                    }
                },
                xAxis: {
                    tickInterval : 7,
                    labels: {
                        formatter: function() { var d = new Date(this.value); return ""+(d.getMonth()+1)+"/"+d.getDate(); }
                    },
                },
                yAxis: {
                    title: {
                        text: 'Count'
                    },
                    plotLines: [{
                        value: 0,
                        width: 1,
                        color: '#808080'
                    }]
                },
                tooltip: {
                },
                legend: { align: 'center', verticalAlign: 'bottom' }
            }
        });
        this.add(extChart);
        var chart = this.down("#chart1");
        var p = Ext.get(chart.id);
        var elems = p.query("div.x-mask");
        _.each(elems, function(e) { e.remove(); });
        var elems = p.query("div.x-mask-msg");
        _.each(elems, function(e) { e.remove(); });
    }

});
