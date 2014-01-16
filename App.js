var acceptedPointsData = [];
var acceptedCountData = [];
var myMask = null;
var app = null;
var showAssignedProgram = false;

// demonstrate github.com

Ext.define('CustomApp', {
    scopeType: 'release',
    extend: 'Rally.app.App',
    componentCls: 'app',
    
    layout : 'column',
    // defaultMargins : { top: 10, right: 20, bottom: 10, left: 10 },

    launch: function() {

        app = this;

        Ext.state.Manager.setProvider(
            new Ext.state.CookieProvider({ expires: new Date(new Date().getTime()+(10006060247)) })
        );

        console.log(Ext.state.Manager.get("saved_selected_psi_value"));

        app.initialReleaseValue = Ext.state.Manager.get("saved_selected_psi_value") !== undefined ? 
            Ext.state.Manager.get("saved_selected_psi_value") : "";


        
        var that = this;
        console.log("launch");
        // get the project id.
        this.project = this.getContext().getProject().ObjectID;

        // get the release (if on a page scoped to the release)
        var tbName = getReleaseTimeBox(this);

        var configs = [];
        
        configs.push({ model : "PreliminaryEstimate", 
                       fetch : ['Name','ObjectID','Value'], 
                       filters : [] 
        });
        // configs.push({ model : "Project",             
        //               fetch : ['Name','ObjectID'], 
        //               filters : [] 
        // });
        configs.push({ model : "Release",             
                       fetch : ['Name', 'ObjectID', 'Project', 'ReleaseStartDate', 'ReleaseDate' ], 
                       filters:[] 
        });
        configs.push({ model : "Iteration",             
                       fetch : ['Name', 'ObjectID', 'Project', 'StartDate', 'EndDate' ], 
                       filters:[] 
        });
        
        async.map( configs, this.wsapiQuery, function(err,results) {
            that.peRecords = results[0];
            // that.projects  = results[1];
            app.releases  = results[1];
            that.iterations = results[2];
            if (showAssignedProgram)
                that.createAssignedProgramCombo();
            that.createReleaseCombo();
            that.createTypeChooser();
        });
    },
    
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
                    console.log("wsapi:",data.length);
                    callback(null,data);
                }
            }
        });
    },
    
    createAssignedProgramCombo : function() {
        // assigned Program (if set to true)
        this.assignedProgramCombo = Ext.create("Rally.ui.combobox.FieldValueComboBox", {
            model : "PortfolioItem/Feature",
            field : "AssignedProgram",
            stateful : true,
            stateId : "assignedProgramCombo"
        });
        this.add(this.assignedProgramCombo);
    },
    
    createTypeChooser : function() {
        
        this.chooser = Ext.create( 'Ext.form.FieldContainer', {
            columnWidth : .25,
            labelStyle: 'padding-left:10px;',
            fieldLabel : 'Type',
            defaultType: 'radiofield',
            defaults: {
                flex: 1
            },
            layout: 'hbox',
            value : 'points',
            items: [
                {
                    boxLabel  : 'Points',
                    name      : 'Type',
                    inputValue: 0,
                    id        : 'radio4',
                    
                }, {
                    boxLabel  : 'Count',
                    name      : 'Type',
                    inputValue: 1,
                    id        : 'radio5',
                    listeners : {
                        change : function() { 
                            app.reload();
                        }
                    }
                }
            ]
        });
        
        this.chooser.items.items[0].setValue(true);
        this.add(this.chooser);
    },

    // creates a release drop down combo box with the uniq set of release names
    createReleaseCombo : function() {
        
        // given a list of all releases (accross sub projects)
        var releases = _.map( app.releases, function(rec) { return { name : rec.get("Name"), objectid : rec.get("ObjectID"), releaseDate : new Date(Date.parse(rec.get("ReleaseDate")))};});
        // get a unique list by name to display in combobox        
        releases = _.uniq( releases, function (r) { return r.name; });
        releases = _.sortBy( releases, function(rec) {return rec.releaseDate;}).reverse();
        // create a store with the set of unique releases
        var releasesStore = Ext.create('Ext.data.Store', {
            fields: ['name','objectid'], data : releases 
        });
        // construct the combo box using the store
        // var cb = Ext.create("Ext.ux.CheckCombo", {
        app.cb = Ext.create("Ext.ux.CheckCombo", {
            // fieldLabel: 'Release',
            store: releasesStore,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'name',
            value : app.initialReleaseValue,
            noData : true,
            // width: 300,
            columnWidth: .25,
                
            listeners : {
                scope : this,
                afterrender : function(cb,eOpts) {
                    console.log("after render");
                    var releases = _.map( app.initialReleaseValue.split(","), function(r) {
                        return r;
                    });
                    cb.setValue(releases);
                    if (releases.length > 0)
                        app.reload();
                },
                // after collapsing the list
                collapse : function ( field, eOpts ) {
                    app.reload();
                }
            }
        });
        this.add(app.cb);
    },

    reload : function() {
        Ext.state.Manager.set("saved_selected_psi_value",app.cb.getValue());

        console.log(app.cb.getValue());
        var r = [];
        // // for each selected release name, select all releases with that name and grab the object id and push it into an 
        // // array. The result will be an array of all matching release that we will use to query for snapshots.
        _.each( app.cb.getValue().split(","), function (rn) {
            var matching_releases = _.filter( app.releases, function(r) { return rn == r.get("Name");});
            var uniq_releases = _.uniq(matching_releases, function(r) { return r.get("Name"); });
            _.each(uniq_releases,function(release) { r.push(release); });
        });
        if (r.length > 0) {
            myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Please wait..."});
            myMask.show();
            this.selectedReleases = r;
            this.queryFeatures(r);
        }

    },
    
    queryFeatures : function(releases) {
        // get Features for the selected release(s)
        var that = this;
        var filter = null;
        
        if (showAssignedProgram && this.assignedProgramCombo.getValue() != null && this.assignedProgramCombo.getValue() != "") {
            console.log("assingedValue",this.assignedProgramCombo.getValue());
            filter = Ext.create('Rally.data.QueryFilter', {
                property: 'AssignedProgram',
                operator: '=',
                value: this.assignedProgramCombo.getValue()
            });
        } else {
            _.each(releases,function(release,i) {
                var f = Ext.create('Rally.data.QueryFilter', {
                    property: 'Release.Name',
                    operator: '=',
                    value: release.get("Name")
                });
                filter = i === 0 ? f : filter.or(f);
            });
        }
        console.log("filter",filter.toString());
        
        
        return Ext.create('Rally.data.WsapiDataStore', {
            autoLoad: true,
            model: 'PortfolioItem/Feature',
            limit : 'Infinity',
            fetch: ['ObjectID','FormattedID' ],
            filters: [filter],
            listeners: {
                load: function(store, features) {
                    console.log("features",features.length,features);
                    that.createChart(features,releases);
                }
            }
        });        
    },
    
    pointsUnitType : function() {

        return this.chooser.items.items[0].getValue()==true;

    },

    createChart1 : function ( features, releases,start,end) {
        
        var that = this;
        var lumenize = window.parent.Rally.data.lookback.Lumenize;
        var snapShotData = _.map(features,function(d){return d.data;});
        var snaps = _.sortBy(snapShotData,"_UnformattedID");
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
            workDays: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday'
        };
        // release start and end dates
        var startOnISOString = new lumenize.Time(start).getISOStringInTZ(config.tz);
        var upToDateISOString = new lumenize.Time(end).getISOStringInTZ(config.tz);
        // create the calculator and add snapshots to it.
        calculator = new lumenize.TimeSeriesCalculator(config);
        calculator.addSnapshots(snapShotData, startOnISOString, upToDateISOString);
        
        // create a high charts series config object, used to get the hc series data
        var hcConfig = [{ name : "label" }, 
                        this.pointsUnitType() ? { name : "Planned Points" } : { name : "Planned Count" }, 
                        { name : "PreliminaryEstimate"},
                        this.pointsUnitType() ? { name : "Accepted Points"} : { name : "Accepted Count"},
                        this.pointsUnitType() ? { name : "ProjectionPoints"}: { name : "ProjectionCount"},
                        { name : "Count", type:'column'},
                        { name : "Completed",type:'column'} ];
        var hc = lumenize.arrayOfMaps_To_HighChartsSeries(calculator.getResults().seriesData, hcConfig);
        
        this._showChart(hc);
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

    createChart : function (features,releases) {

        var ids = _.pluck(features, function(feature) { return feature.get("ObjectID");} );
        console.log("ids:",ids.length);
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
            fetch: ['_UnformattedID','ObjectID','_TypeHierarchy','PreliminaryEstimate', 'LeafStoryCount','LeafStoryPlanEstimateTotal','AcceptedLeafStoryPlanEstimateTotal','AcceptedLeafStoryCount','PercentDoneByStoryCount'],
            hydrate: ['_TypeHierarchy']
		};

        storeConfig.find['ObjectID'] = { "$in": ids };
        // storeConfig.find['_ProjectHierarchy'] = { "$in": this.project };
        storeConfig.find['_ValidTo'] = { "$gte" : isoStart  };
        storeConfig.listeners = {
            scope : this,
            load: function(store, features, success) {
                console.log("feature snapshots:",features.length)
                this.createChart1(features,releases,start,end);
            }
        };
        
        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', storeConfig);
    },
    
    _showChart : function(series) {
        var that = this;
        var chart = this.down("#chart1");
        myMask.hide();
        if (chart !== null)
            chart.removeAll();
            
        // create plotlines
        var plotlines = this.createPlotLines(series[0].data);
        
        // set the tick interval
        var tickInterval = series[1].data.length <= (7*20) ? 7 : (series[1].data.length / 20);

        // series[1].data = _.map(series[1].data, function(d) { return _.isNull(d) ? 0 : d; });

        var extChart = Ext.create('Rally.ui.chart.Chart', {
            columnWidth : 1,
            itemId : "chart1",
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
                        text: that.pointsUnitType() ? 'Points':'Count'
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
