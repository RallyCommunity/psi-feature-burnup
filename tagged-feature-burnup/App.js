var app = null;

Ext.define('CustomApp', {
	extend: 'Rally.app.App',
	componentCls: 'app',
	items:{ },

	launch: function() {

		var workspace = (this.getContext().getWorkspace());
console.log ('foo');
		Rally.data.ModelFactory.getModel({
		    type: 'Workspace',
		    success: function(model) {
		        model.load(workspace.ObjectID, {
			    fetch: true,
				    callback: function(result, operation) {
				        if(operation.wasSuccessful()) {
				            console.log("workspace result",result);
				        }
				    }
				});
			}
		});

		app = this;
		app.series = createSeriesArray();
		console.log("series",app.series);
		app.itemtype = app.getSetting('itemtype');
		app.tags = app.getSetting('tags') .split(",");
		console.log(app.tags);
		app.title = "Portfolio Item burnup for tags '" + app.tags + "'";

		if (app.tags[0] === "") {
			console.log("No Tags specified in configuration");
			app.add({html:"No Tags specied. Edit the app setting to set Tags to filter on"});
			return;
		}

		app.mask = new Ext.LoadMask(Ext.getBody(), {msg:"Please wait..."});
		app.mask.show();
		async.waterfall([
			app.queryEstimateValues,
			app.queryFeatures,
			app.getStartAndEndDates,
			app.querySnapshots,
			app.lumenize,
			app.showChart
		], function(err,results){
			console.log("done!");
			app.mask.hide();
		});

	},

	config: {
		defaultSettings: {
			itemtype : 'Feature',
			tags     : 'MVP',
			ignoreZeroValues        : true,
			PreliminaryEstimate     : true,
			StoryPoints             : false,
			StoryCount              : true,
			StoryPointsProjection   : false,
			StoryCountProjection    : true,
			AcceptedStoryPoints     : false,
			AcceptedStoryCount      : true,
			AcceptedPointsProjection: false,
			AcceptedCountProjection : true,
			FeatureCount            : false,
			FeatureCountCompleted   : false
		}
	},

	getSettingsFields: function() {

		var checkValues = _.map(createSeriesArray(),function(s) {
			return { name : s.name, xtype : 'rallycheckboxfield', label : s.description};
		});

		return [
			{
				name: 'itemtype',
				xtype: 'rallytextfield',
				label : "Portfolio Item Type eg. Feature"
			},
			{
				name: 'tags',
				xtype: 'rallytextfield',
				label : "Comma separated list of tags eg. tag1,tag2,tag3"
			},
			{
				name: 'ignoreZeroValues',
				xtype: 'rallycheckboxfield',
				label: 'For projection ignore zero values'
			}
		].concat(checkValues);
	},

	queryEstimateValues : function(callback) {

		var configs = [];
		configs.push({ model : "PreliminaryEstimate", 
                        fetch : ['Name','ObjectID','Value'],
                        filters : []
		});

		async.map( configs, wsapiQuery, function(err,results) {
			console.log("Estimates",results[0]);
			app.peRecords = results[0];
			callback(null);
		});


	},

	queryFeatures : function(callback) {
		console.log("queryFeatures");
		var configs = [];
		var filter = null;

		_.each(app.tags,function(tag,i){
			var f = Ext.create('Rally.data.QueryFilter',
				{ property: 'Tags.Name', operator: '=',value: tag }
			);

			filter = (i===0) ? f : filter.or(f);
		});

		configs.push({ model : "PortfolioItem/"+app.itemtype,
                        fetch : ['Name', 'ObjectID', 'PlannedStartDate','PlannedEndDate' ],
                        filters:[filter]
		});
		
		async.map( configs, wsapiQuery, function(err,results) {
			console.log("Features:",results[0]);
			callback(null,results[0]);
		});
	},

	getStartAndEndDates : function( features, callback) {

		var startdates = _.compact( _.pluck(features,function(r) { return r.get("PlannedStartDate");}) );
		var enddates   = _.compact( _.pluck(features,function(r) { return r.get("PlannedEndDate");}) );

		app.startdate = _.min(startdates);
		app.enddate   = _.max(enddates);
		app.isoStartDate  = Rally.util.DateTime.toIsoString(app.startdate, false);
		app.isoEndDate    = Rally.util.DateTime.toIsoString(app.enddate, false);

		console.log("start",app.startdate,"end",app.enddate);

		callback(null,features);

	},

	querySnapshots : function( features, callback) {
		
		var config = {};
		config.fetch   = ['_UnformattedID','ObjectID','_TypeHierarchy','PreliminaryEstimate', 'LeafStoryCount',
                            'LeafStoryPlanEstimateTotal','AcceptedLeafStoryPlanEstimateTotal','AcceptedLeafStoryCount',
                            'PercentDoneByStoryCount'],
		config.hydrate =  ['_TypeHierarchy'];
		config.find    = {
			'ObjectID' : { "$in": _.pluck( features, function( f ) { return f.get("ObjectID"); } ) },
			'_ValidFrom' : { "$gte" : app.isoStartDate }
		};

		async.map([config],snapshotQuery,function(error,results) {
			callback(null,results[0]);
		});
	},

	lumenize : function ( snapshots , callback) {
		
		var lumenize = window.parent.Rally.data.lookback.Lumenize;
		var snapShotData = _.map(snapshots,function(d){return d.data;});
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
			tz: 'America/New_York',
			holidays: holidays,
			workDays: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday'
		};
		// chart start and end dates
		var startOnISOString = new lumenize.Time(app.startdate).getISOStringInTZ(config.tz);
		var upToDateISOString = new lumenize.Time(app.enddate).getISOStringInTZ(config.tz);
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
		console.log("hc",hc);
		callback(null, trimHighChartsConfig(hc));
	},

	showChart : function(series, callback) {

		var chart = app.down("#chart1");
		if (chart !== null)
			chart.removeAll();
			
		// set the tick interval
		var tickInterval = series[1].data.length <= (7*20) ? 7 : (series[1].data.length / 20);

        var colors = createColorsArray(series);

		var extChart = Ext.create('Rally.ui.chart.Chart', {
			columnWidth : 1,
			itemId : "chart1",
			listeners : {
				afterrender : function() {
					console.log("rendered");
					callback(null,null);
				}
			},
			chartData: {
				categories : series[0].data,
				series : series.slice(1, series.length)
			},

			chartColors: colors,

			chartConfig : {
				chart: {
				},
				title: {
				text: app.title,
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
					// plotLines : plotlines,
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
						// text: app.unittype
						text : "Points\\Count"
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
		app.add(extChart);
		chart = app.down("#chart1");
		var p = Ext.get(chart.id);
		elems = p.query("div.x-mask");
		_.each(elems, function(e) { e.remove(); });
		var elems = p.query("div.x-mask-msg");
		_.each(elems, function(e) { e.remove(); });

	}

});
