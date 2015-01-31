var acceptedPointsData = [];
var acceptedCountData = [];
var app = null;
var showAssignedProgram = true;

Ext.define('CustomApp', {
    scopeType: 'release',
    extend: 'Rally.app.App',
    componentCls: 'app',
    itemId: 'burnupApp',

    items: [
        {
            xtype: 'rallyreleasecombobox',
            fieldLabel: 'Release',
            labelAlign: 'right',
            width: 300,
            itemId: 'rallyRelease',
            listeners: {
                ready: function () {
                    console.log('ready');
                    var app = this.up('#burnupApp');
                    
                    app.setSelectedRelease(this);
                },
                select: function () {
                    var app = this.up('#burnupApp');
                    app.setSelectedRelease(this);
                }
            }
        }
    ],
    
    // Called when the release combo box is ready or selected.  This triggers the bulding of the chart.
    setSelectedRelease: function(releaseCombo) {
        releaseCombo.setLoading(true);
        
        var releaseName = releaseCombo.getRecord().data.Name;

        this.defaultRelease = releaseName;
        this.createChart();
    },
    
    
    launch: function() {
        app = this;
    },
    
    // switch to app configuration from ui selection
    config: {

        defaultSettings : {
            releases                : "",
            epicIds                 : "",
            ignoreZeroValues        : true,
            PreliminaryEstimate     : false,
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

        var checkValues = _.map(createSeriesArray(),function(s) {
            return { name : s.name, xtype : 'rallycheckboxfield', label : s.description};
        });

        var values = [
            {
                name: 'releases',
                xtype: 'rallytextfield',
                label : "Release names to be included (comma seperated)"
            },
            {
                name: 'epicIds',
                xtype: 'rallytextfield',
                label : "(Optional) List of Parent PortfolioItem (Epics) ids to filter Features by"
            },

            {
                name: 'ignoreZeroValues',
                xtype: 'rallycheckboxfield',
                label: 'For projection ignore zero values'
            }
        ];

        _.each(values,function(value){
            value.labelWidth = 250;
            value.labelAlign = 'left';
        });

        return values.concat(checkValues);
    },

    createChart: function() {
        if (!app) {
            app = this;
        }
        
        app.series = createSeriesArray();
        app.configReleases = app.getSetting("releases") || app.defaultRelease;
        app.ignoreZeroValues = app.getSetting("ignoreZeroValues");
        app.epicIds = app.getSetting("epicIds");

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
        configs.push({ model : "Milestone",
                       fetch : ['Name', 'TargetDate', 'DisplayColor'],
                       filters : [
                                Ext.create('Rally.data.QueryFilter', { property:'Projects', operator: 'contains', value:'project/' + this.project }).or(
                                Ext.create('Rally.data.QueryFilter', { property:'TargetProject', operator: '=', value: null })).and(
                                    Ext.create('Rally.data.QueryFilter', { property:'TargetDate', operator: '!=', value: null }))
                       ],
                       sorters: [{
                           property: 'TargetDate',
                           direction: 'DESC'
                       }]
        });

        // get the preliminary estimate type values, and the releases.
        async.map( configs, app.wsapiQuery, function(err,results) {

            app.peRecords   = results[0];
            app.releases    = results[1];
            app.featureType = results[2][0].get("TypePath");
            app.milestones  = results[3];
            
            if (app.releases.length===0) {
                app.resetChart("No Releases found with this name: "+app.configReleases);
                
                return;
            }

            configs = [
                {
                    model  : "Iteration",
                    fetch  : ['Name', 'ObjectID', 'Project', 'StartDate', 'EndDate'],
                    filters: app.createIterationFilter(app.releases)
                }
            ];

            // get the iterations
            async.map( configs, app.wsapiQuery, function(err,results) {

                app.iterations = results[0];

                if (app.epicIds && app.epicIds.split(",")[0] !=="")
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
            },
            sorters: config.sorters
        });

    },

    resetChart: function(mesg) {
        var releaseCombo = app.down('#rallyRelease');
        
        releaseCombo.setLoading(false);
        
        var chart = app.down("#chart1");
        if (chart !== null) {
            chart.removeAll();
        }
            
        if (mesg) {
            Rally.ui.notify.Notifier.show({message: mesg, color: 'red'});
        } else {
            Rally.ui.notify.Notifier.hide();
        }
    },
    
    executeFeatureQuery: function(filter) {
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
                        app.resetChart('No features found for this release');
                        
                    } else {
                        app.queryFeatureSnapshots();
                    }
                }
            }
        });        
    },

    queryEpicFeatures : function() {
        var filter = null;
        var epicIds = app.epicIds.split(",");

        if (epicIds.length === 0) {
            app.resetChart("No epic id's specified");
            
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

        app.executeFeatureQuery(filter);
    },
    
    queryFeatures : function() {
        var filter = null;
        var releaseNames = _.uniq(_.map(app.releases,function(r){ return r.get("Name");}));
        
        console.log("releaseNames", releaseNames);

        _.each( releaseNames , function( release, i ) {
            var f = Ext.create('Rally.data.QueryFilter', {
                property: 'Release.Name',
                operator: '=',
                value: release
            });
            filter = i === 0 ? f : filter.or(f);
        });

        app.executeFeatureQuery(filter);
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
        var lumenize = window.parent.Rally.data.lookback.Lumenize;
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
        this.showChart( trimHighChartsConfig(hc) );
    },
    
    parsePlotLines: function(seriesData, recordArray, dateField, plotLineStyle) {
        var yLabelOffset = 0;
        
        var plotlines = _.map(recordArray, function(record){
            var d = new Date(Date.parse(record.raw[dateField])).toISOString().split("T")[0];
            
            var color = plotLineStyle.color || record.get("DisplayColor") || "grey";
            var labelHTML = '<span style="font-family:Rally;color:' + color + '">8</span>';
            var hoverText = record.get("Name");
            
            var plotLine = {
                dashStyle: "Dot",
                color: color,
                width: 1,
                value: _.indexOf(seriesData,d)
            };
            
            if (plotLineStyle.showLabel) {
                plotLine.label = {
                    text: labelHTML + hoverText,
                    rotation: 0,
                    verticalAlign: 'top',
                    y: yLabelOffset % 2*15,
                    x: -6,
                    textAlign: 'left',
                    useHTML: true
                };
                
                yLabelOffset++;
            }
            
            if (plotLineStyle.canRemove) {
                var id = 'milestone-' + record.get("Name");
                
                plotLine.id = id;
                plotLine.events = {
                    click: function (e) {
                        var plotLineId = this.id;
                        var axis       = this.axis;
                        axis.removePlotLine(plotLineId);
                    },
                    mouseover: function () {
                        console.log('mouseover');
                        // var plotline = this;
                        // plotline.label.text = labelHTML + hoverText;
                        // plotline.axis.update();
                    },
                    mouseout: function () {
                        console.log('mouseout');
                        // var plotline = this;
                        // plotline.label.text = labelHTML;
                        // plotline.axis.update();
                    }
                };
            }
            
            _.each(plotLineStyle, function(value, key) {
                plotLine[key] = value;
            }, this);
            
            
            return plotLine;
        });
        return plotlines;
    },

    createPlotLines: function(seriesData) {
        var app = this;
        
        // filter the iterations
        var start = new Date( Date.parse(seriesData[0]));
        var end   = new Date( Date.parse(seriesData[seriesData.length-1]));
        var releaseI = _.filter(this.iterations,function(i) { return i.get("EndDate") >= start && i.get("EndDate") <= end;});
        releaseI = _.uniq(releaseI,function(i) { return i.get("Name");});
        
        var itPlotLines = this.parsePlotLines(seriesData, releaseI, 'EndDate',                  { dashStyle: 'dot', color: 'grey'} );
        var rePlotLines = this.parsePlotLines(seriesData, this.selectedReleases, 'ReleaseDate', { dashStyle: 'dot', color: 'grey'} );
        var miPlotLines = this.parsePlotLines(seriesData, this.milestones, 'TargetDate',        { dashStyle: 'dash', width: 2, showLabel: true, canRemove: true } );
        
        return itPlotLines.concat(rePlotLines).concat(miPlotLines);
    },

    showChart : function(series) {
        var that = this;

        app.resetChart();
            
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
                text: 'Release Burnup',
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
        
        app.clearLoading();
    },
    
    // Even though we don't seem to set it explicitly, the chart is left with
    // the loading mask on.  This hack turns it off on most browsers.
    clearLoading: function() {
        chart = this.down("#chart1");
        
        var p = Ext.get(chart.id);
        elems = p.query("div.x-mask");
        
        _.each(elems, function(e) { e.remove(); });
        var elems = p.query("div.x-mask-msg");
        _.each(elems, function(e) { e.remove(); });
    }

});
