var acceptedPointsData = [];
var acceptedCountData = [];
var myMask = null;
var app = null;
var showAssignedProgram = true;

Ext.define('CustomApp', {
    scopeType: 'release',
    extend: 'Rally.app.App',
    componentCls: 'app',

    // switch to app configuration from ui selection
    config: {

        defaultSettings : {
            releases                : "",
            epicIds                 : "",
            ignoreZeroValues        : true,
            flatScopeProjection     : false,
            completionDateScope     : true,
            PreliminaryEstimate     : true,
            StoryPoints             : true,
            StoryCount              : false,
            StoryPointsProjection   : true,
            StoryCountProjection    : false,
            AcceptedStoryPoints     : true,
            AcceptedStoryCount      : false,
            AcceptedPointsProjection: true,
            AcceptedCountProjection : false,
            FeatureCount            : false,
            FeatureCountCompleted   : false,
            HistoricalProjection    : false,
            RefinedEstimate : false
        }

    },

    getSettingsFields: function() {

        var scopeTypeStore = new Ext.data.ArrayStore({
            fields: ['scope'],
            data : [['Count'],['Points']]
        });  

        var checkValues = _.map(createSeriesArray(),function(s) {
            return { name : s.name, xtype : 'rallycheckboxfield', label : s.description};
        });

        var values = [
            {
                name: 'releases',
                xtype: 'rallytextfield',
                // label : "Release names to be included (comma seperated)",
                // width : 400
                boxLabelAlign: 'after',
                fieldLabel: 'Releases',
                margin: '0 0 15 50',
                labelStyle : "width:200px;",
                afterLabelTpl: 'Release name(s) to be included (comma separated)',
                width : 600
            },
            // {
            //     name: 'milestone_picker',
            //     xtype: 'rallymilestonepicker',
            //     // label : "Release names to be included (comma seperated)",
            //     // width : 400
            //     boxLabelAlign: 'after',
            //     fieldLabel: 'Milestone',
            //     margin: '0 0 15 50',
            //     labelStyle : "width:200px;",
            //     afterLabelTpl: '(Optional)Limit to features for this milestone',
            //     width : 600
            // },
            {
                name: 'milestones',
                xtype: 'rallytextfield',
                // label : "Release names to be included (comma seperated)",
                // width : 400
                boxLabelAlign: 'after',
                fieldLabel: 'Milestone',
                margin: '0 0 15 50',
                labelStyle : "width:200px;",
                afterLabelTpl: '(Optional)Limit to features for this milestone',
                width : 600
            },
            {
                name: 'epicIds',
                xtype: 'rallytextfield',
//                label : "(Optional) List of Parent PortfolioItem (Epics) ids to filter Features by"
                boxLabelAlign: 'after',
                fieldLabel: 'Epics',
                margin: '0 0 15 50',
                labelStyle : "width:200px;",
                afterLabelTpl: '(Optional) List of Parent PortfolioItem (Epics) ids to filter Features by'
            },
            {
                name: 'ignoreZeroValues',
                xtype: 'rallycheckboxfield',
                // label: 'For projection ignore zero values'
                boxLabelAlign: 'after',
                fieldLabel: 'ignoreZeroValues',
                margin: '0 0 15 50',
                labelStyle : "width:200px;",
                afterLabelTpl: 'For projection ignore zero values'               
            },
            {
                name: 'flatScopeProjection',
                xtype: 'rallycheckboxfield',
                // label: 'For projection ignore zero values'
                boxLabelAlign: 'after',
                fieldLabel: 'Flat Scope Projection',
                margin: '0 0 15 50',
                labelStyle : "width:200px;",
                afterLabelTpl: 'Do not project scope values'               
            },
            {
                name: 'completionDateScope',
                xtype: 'rallycheckboxfield',
                // label: 'For projection ignore zero values'
                boxLabelAlign: 'after',
                fieldLabel: 'Use count for Expected Completion Date',
                margin: '0 0 15 50',
                labelStyle : "width:300px;",
                afterLabelTpl: '(otherwise based on points)'               
            }
        ];


        _.each(values,function(value){
            value.labelWidth = 250;
            value.labelAlign = 'left'
        });

        return values.concat(checkValues);
    },

    launch: function() {

        app = this;
        app.series = createSeriesArray();
        app.configReleases = app.getSetting("releases");
        app.ignoreZeroValues = app.getSetting("ignoreZeroValues");
        app.flatScopeProjection = app.getSetting("flatScopeProjection");
        app.epicIds = app.getSetting("epicIds");
        app.milestones = app.getSetting("milestones");
        app.completionDateScope = app.getSetting("completionDateScope")
        console.log("milestones",app.milestones);

        if (app.configReleases==="") {
            this.add({html:"Please Configure this app by selecting Edit App Settings from Configure (gear) Menu"});
            return;
        }

        var that = this;
        // get the project id.
        this.project = this.getContext().getProject().ObjectID;

        // get the release (if on a page scoped to the release)
        var tbName = getReleaseTimeBox(this);
        // release selected page will over-ride app config
        app.configReleases = tbName !== "" ? tbName : app.configReleases;

        var configs = [];
        
        // query for estimate values, releases and iterations.
        configs.push({ model : "PreliminaryEstimate", 
                       fetch : ['Name','ObjectID','Value'], 
                       filters : [] 
        });
        configs.push({ model : "Release",             
                       fetch : ['Name', 'ObjectID', 'Project', 'ReleaseStartDate', 'ReleaseDate' ], 
                       filters: [app.createReleaseFilter(app.configReleases)]
        });
        configs.push({ model : "TypeDefinition",
                       fetch : true,
                       filters : [ { property:"Ordinal", operator:"=", value:0} ]
        });

        // get the preliminary estimate type values, and the releases.
        async.map( configs, app.wsapiQuery, function(err,results) {

            app.peRecords   = results[0];
            app.releases    = results[1];
            app.featureType = results[2][0].get("TypePath");

            if (app.releases.length===0) {
                app.add({html:"No Releases found with this name: "+app.configReleases});
                return;
            }

            configs = [
                {
                    model  : "Iteration",
                    fetch  : ['Name', 'ObjectID', 'Project', 'StartDate', 'EndDate' ],
                    filters: app.createIterationFilter(app.releases)
                }
            ];

            // get the iterations
            async.map( configs, app.wsapiQuery, function(err,results) {

                app.iterations = results[0];

                if (app.epicIds.split(",")[0] !=="")
                    app.queryEpicFeatures();
                else
                    app.queryFeatures();

            });
        });
    },

    // remove leading and trailing spaces
    trimString : function (str) {
        return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
    },



    // creates a filter to return all releases with a specified set of names
    createReleaseFilter : function(releaseNames) {

        var filter = null;

        _.each( releaseNames.split(","), function( releaseName, i ) {
            if (releaseName !== "") {
                var f = Ext.create('Rally.data.wsapi.Filter', {
                        property : 'Name', operator : '=', value : app.trimString(releaseName) }
                );
                filter = (i===0) ? f : filter.or(f);
            }
        });

        console.log("Release Filter:",filter.toString());
        return filter;

    },

    createIterationFilter : function(releases) {

        var extent = app.getReleaseExtent(releases);

        var filter = Ext.create('Rally.data.wsapi.Filter', {
            property : 'EndDate', operator: ">=", value: extent.isoStart
        });

        filter = filter.and( Ext.create('Rally.data.wsapi.Filter', {
                property : 'EndDate', operator: "<=", value: extent.isoEnd
            })
        );

        return filter;
    },

    getReleaseExtent : function( releases ) {

        var start = _.min(_.pluck(releases,function(r) { return r.get("ReleaseStartDate");}));
        var end   = _.max(_.pluck(releases,function(r) { return r.get("ReleaseDate");}));
        var isoStart  = Rally.util.DateTime.toIsoString(start, false);
        var isoEnd    = Rally.util.DateTime.toIsoString(end, false);

        return { start : start, end : end, isoStart : isoStart, isoEnd : isoEnd };

    },

    // generic function to perform a web services query    
    wsapiQuery : function( config , callback ) {

        Ext.create('Rally.data.WsapiDataStore', {
            autoLoad : true,
            limit : "Infinity",
            model : config.model,
            fetch : config.fetch,
            filters : config.filters,
            listeners : {
                scope : this,
                load : function(store, data) {
                    callback(null,data);
                }
            }
        });

    },

    queryEpicFeatures : function() {

        myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Please wait..."});

        var filter = null;
        var epicIds = app.epicIds.split(",");

        if (epicIds.length === 0) {
            app.add({html:"No epic id's specified"+app.configReleases});
            return;
        }

        _.each(epicIds, function( epicId, i) {
            var f = Ext.create('Rally.data.QueryFilter', {
                property: 'Parent.FormattedID',
                operator: '=',
                value: epicId
            });
            filter = i === 0 ? f : filter.or(f);
        });

        return Ext.create('Rally.data.WsapiDataStore', {
            autoLoad: true,
            model : app.featureType,
            limit : 'Infinity',
            fetch: ['ObjectID','FormattedID' ],
            filters: [filter],
            listeners: {
                load: function(store, features) {
                    console.log("Loaded:"+features.length," Features.");
                    app.features = features;
                    if (app.features.length === 0) {
                        app.add({html:"No features for parent PortfolioItem :"+app.epicIds});
                        return;
                    } else {
                    app.queryFeatureSnapshots();
                    }
                }
            }
        });        

    },

    queryFeatures : function() {

        myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Please wait..."});
        var filter = null;

        var releaseNames = _.uniq(_.map(app.releases,function(r){ return r.get("Name");}));
        console.log("releaseNames",releaseNames);

        _.each( releaseNames , function( release, i ) {
            var f = Ext.create('Rally.data.QueryFilter', {
                property: 'Release.Name',
                operator: '=',
                value: release
            });
            filter = i === 0 ? f : filter.or(f);
        });

        // add filter for milestone.
        if (!_.isNull(app.milestones) && app.milestones != "") {
            var f = Ext.create('Rally.data.QueryFilter', {
                property: 'Milestones.Name',
                operator: '=',
                value: app.milestones
            });
            filter = filter.and(f);
        }
        console.log("Filter:",filter.toString());

        return Ext.create('Rally.data.WsapiDataStore', {
            autoLoad: true,
//            model: 'PortfolioItem/Feature',
            model : app.featureType,
            limit : 'Infinity',
            fetch: ['ObjectID','FormattedID' ],
            filters: [filter],
            listeners: {
                load: function(store, features) {
                    console.log("Loaded:"+features.length," Features.",features);
                    console.log(_.map(features,function(f){return f.get("FormattedID")}));
                    app.features = features;
                    if (app.features.length === 0) {
                        app.add({html:"No features in release(s):"+app.configReleases});
                        return;
                    } else {
                    app.queryFeatureSnapshots();
                    }
                }
            }
        });        
    },
    
    queryFeatureSnapshots : function () {

        var ids = _.pluck(app.features, function(feature) { return feature.get("ObjectID");} );
        // var pes = _.pluck(app.features, function(feature) { return feature.get("PreliminaryEstimate");} );
        var extent = app.getReleaseExtent(app.releases);
        // console.log("ids",ids,pes);

        var storeConfig = {
            find : {
                // '_TypeHierarchy' : { "$in" : ["PortfolioItem/PIFTeam"] },
                'ObjectID' : { "$in" : ids },
                '_ValidTo' : { "$gte" : extent.isoStart }
            },
            autoLoad : true,
            pageSize:1000,
            limit: 'Infinity',
            fetch: ['_UnformattedID','ObjectID','_TypeHierarchy','PreliminaryEstimate', 'LeafStoryCount','LeafStoryPlanEstimateTotal','AcceptedLeafStoryPlanEstimateTotal','AcceptedLeafStoryCount','PercentDoneByStoryCount','RefinedEstimate'],
            hydrate: ['_TypeHierarchy']
        };

        storeConfig.listeners = {
            scope : this,
            load: function(store, snapshots, success) {
                console.log("Loaded:"+snapshots.length," Snapshots.");
                app.createChartData(snapshots);
            }
        };

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', storeConfig);
    },

    createChartData : function ( snapshots ) {
        
        var that = this;
        var lumenize = window.Rally.data.lookback.Lumenize || window.parent.Rally.data.lookback.Lumenize;
        var snapShotData = _.map(snapshots,function(d){return d.data;});
        var extent = app.getReleaseExtent(app.releases);

        var snaps = _.sortBy(snapShotData,"_UnformattedID");
        // can be used to 'knockout' holidays
        var holidays = [
            //{year: 2014, month: 1, day: 1}  // Made up holiday to test knockout
        ];

        var myCalc = Ext.create("MyBurnCalculator", {
            series : app.series,
            ignoreZeroValues : app.ignoreZeroValues,
            flatScopeProjection : app.flatScopeProjection,
            peRecords : app.peRecords
        });

        // calculator config
        var config = {
            deriveFieldsOnInput: myCalc.getDerivedFieldsOnInput(),
            metrics: myCalc.getMetrics(),
            summaryMetricsConfig: [],
            deriveFieldsAfterSummary: myCalc.getDerivedFieldsAfterSummary(),
            granularity: lumenize.Time.DAY,
            tz: 'America/Chicago',
            holidays: holidays,
            workDays: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday'
        };
        // release start and end dates
        var startOnISOString = new lumenize.Time(extent.start).getISOStringInTZ(config.tz);
        var upToDateISOString = new lumenize.Time(extent.end).getISOStringInTZ(config.tz);
        // create the calculator and add snapshots to it.
        calculator = new lumenize.TimeSeriesCalculator(config);
        calculator.addSnapshots(snapShotData, startOnISOString, upToDateISOString);
        
        // create a high charts series config object, used to get the hc series data
        var hcConfig = [{ name : "label" }];
        _.each( app.series, function(s) {
            if ( app.getSetting(s.name)===true) {
                hcConfig.push({
                   name : s.description, type : s.display
                });
            }
        });
        var hc = lumenize.arrayOfMaps_To_HighChartsSeries(calculator.getResults().seriesData, hcConfig);

        console.log("Expected Completed Date",myCalc.calcCompletionIndex("AcceptedPointsProjection"));
        app.expectedCompletionDate = myCalc.calcCompletionIndex(
            app.completionDateScope == true ?
                "AcceptedCountProjection" : "AcceptedPointsProjection" 
            );

        this.showChart( trimHighChartsConfig(hc) );
    },

    createPlotLines : function(seriesData) {

        // filter the iterations
        var start = new Date( Date.parse(seriesData[0]));
        var end   = new Date( Date.parse(seriesData[seriesData.length-1]));
        var releaseI = _.filter(this.iterations,function(i) { return i.get("EndDate") >= start && i.get("EndDate") <= end;});
        releaseI = _.uniq(releaseI,function(i) { return i.get("Name");});
        var itPlotLines = _.map(releaseI, function(i){
            var d = new Date(Date.parse(i.raw.EndDate)).toISOString().split("T")[0];
            return {
                label : i.get("Name"),
                dashStyle : "Dot",
                color: 'grey',
                width: 1,
                value: _.indexOf(seriesData,d)
            }; 
        });
        // create release plot lines        
        var rePlotLines = _.map(this.selectedReleases, function(i){
            var d = new Date(Date.parse(i.raw.ReleaseDate)).toISOString().split("T")[0];
            return {
                label : i.get("Name"),
                // dashStyle : "Dot",
                color: 'grey',
                width: 1,
                value: _.indexOf(seriesData,d)
            }; 
        });
        return itPlotLines.concat(rePlotLines);

    },

    showChart : function(series) {

        var that = this;

        // console.log("series",series);
        // console.log("Last Accepted Projection  ",_.last(series[5].data));
        // console.log("Last Historical Projection",_.last(series[6].data));
        
        var chart = this.down("#chart1");
        myMask.hide();
        if (chart !== null)
            chart.removeAll();
            
        // create plotlines
        var plotlines = this.createPlotLines(series[0].data);
        
        // set the tick interval
        var tickInterval = series[1].data.length <= (7*20) ? 7 : (series[1].data.length / 20);

        var extChart = Ext.create('Rally.ui.chart.Chart', {
            columnWidth : 1,
            itemId : "chart1",
            chartData: {
                categories : series[0].data,
                series : series.slice(1, series.length)
            },

            chartColors : createColorsArray(series),

            chartConfig : {
                chart: {
                },
                title: {
                text: 'Feature Burnup ('+ app.configReleases  +')' ,
                    
                x: -20 //center
                },
                subtitle : {
                    text: "Expected Completion Date: "+app.expectedCompletionDate
                },
                plotOptions: {
                    series: {
                        marker: {
                            radius: 2
                        }
                    }
                },
                xAxis: {
                    plotLines : plotlines,
                    //tickInterval : 7,
                    tickInterval : tickInterval,
                    type: 'datetime',
                    labels: {
                        formatter: function() {
                            return Highcharts.dateFormat('%b %d', Date.parse(this.value));
                        }
                    }
                },
                yAxis: {
                    title: {
                        text : 'Points/Count'
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
        chart = this.down("#chart1");
        var p = Ext.get(chart.id);
        elems = p.query("div.x-mask");
        _.each(elems, function(e) { e.remove(); });
        var elems = p.query("div.x-mask-msg");
        _.each(elems, function(e) { e.remove(); });

    }

});
