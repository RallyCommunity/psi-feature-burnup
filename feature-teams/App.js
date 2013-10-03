// global
var myMask = null;
var app = null;

// app
Ext.define('CustomApp', {
    scopeType: 'release',
    extend: 'Rally.app.App',
    componentCls: 'app',

    launch: function() {
        console.log("launch");
        // get the project id.
        this.project = this.getContext().getProject().ObjectID;
        app = this;
        var that = this;
        // get the release (if on a page scoped to the release)
        var tbName = getReleaseTimeBox(this);

        var configs = [];
        
        configs.push({ model : "PreliminaryEstimate", 
                       fetch : ['Name','ObjectID','Value'], 
                       filters : [] 
        });
        configs.push({ model : "Project",             
                       fetch : ['Name','ObjectID'], 
                       filters : [] 
        });
        configs.push({ model : "Release",             
                       fetch : ['Name', 'ObjectID', 'Project', 'ReleaseStartDate', 'ReleaseDate' ], 
                       filters:[] 
        });
        configs.push({ model : "Iteration",             
                       fetch : ['Name', 'ObjectID', 'Project', 'StartDate', 'EndDate' ], 
                       filters:[] 
        });
        
        async.map( configs, this.wsapiQuery, function(err,results) {
            console.log("results",results);
            that.peRecords = results[0];
            that.projects  = results[1];
            that.releases  = results[2];
            that.iterations = results[3];
            that.createReleaseCombo(that.releases);
        });
    },
    
    wsapiQuery : function( config , callback ) {
        Ext.create('Rally.data.WsapiDataStore', {
            autoLoad : true,
            limit : "infinity",
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
            itemId : 'comboRelease',
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
                        this.queryFeatures(releases);
                }
            }
        });
        // this.add(cb);
        
        var cbCompleted = Ext.create("Rally.ui.CheckboxField", {
            fieldLabel : "Hide Completed",
            itemId : "cbCompleted",
            value  : true,    
            listeners : {
                scope : this,
                change : function() {
                    this.queryFeatures(releases);
                }
            }
        });
        
        var container = Ext.create('Ext.container.Container', {
            layout: {
                type: 'hbox',
                align : 'stretch',
                defaultMargins : { top: 0, right: 20, bottom: 0, left: 0 }
            }
        });
        
        container.add(cb);
        container.add(cbCompleted);

        this.add(container);
    },
    
    queryFeatures : function(releases) {
        // get Features for the selected release(s)
        var comboRelease = this.down("#comboRelease");
        var cbCompleted = this.down("#cbCompleted");
        console.log( "releases:",comboRelease.getValue()," completed:",cbCompleted.getValue());
        console.log(releases);
        var that = this;
        this.rows = [];

        if (this.down("#mygrid"))
            this.down("#mygrid").removeAll();
            
        if (comboRelease.getValue()=="") {
            console.log("returning...");
            return;
        }

        var selectedR = [];
        // // for each selected release name, select all releases with that name and grab the object id and push it into an 
        // // array. The result will be an array of all matching release that we will use to query for snapshots.
        _.each( comboRelease.getValue().split(","), function (rn) {
            var matching_releases = _.filter( releases, function(r) { return rn == r.name;});
            var uniq_releases = _.uniq(matching_releases, function(r) { return r.name; });
            _.each(uniq_releases,function(release) { selectedR.push(release) });
        });
        console.log("selectedR",selectedR);
        
        if (selectedR.length > 0) {
            myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Please wait..."});
            myMask.show();
        } else {
            console.log("returning...");
            return;
        }

        var filter = null;
        var compFilter = null;
        _.each(selectedR,function(release,i) {
            console.log("release",release);
            var f = Ext.create('Rally.data.QueryFilter', {
                property: 'Release.Name',
                operator: '=',
                value: release.name
            });
            filter = i == 0 ? f : filter.or(f);
        });
        
        // add filter for completed
        if (cbCompleted.getValue()==true) {
            filter = filter.and (Ext.create('Rally.data.QueryFilter', {
                property: 'PercentDoneByStoryPlanEstimate',
                operator: '<',
                value: 1
            }));
        }
        

        console.log("filter",filter.toString());
        
        var config = { 
            model  : "PortfolioItem/Feature",
            fetch  : ['ObjectID','FormattedID','Name','LeafStoryCount','AcceptedLeafStoryCount','LeafStoryPlanEstimateTotal','AcceptedLeafStoryPlanEstimateTotal','PercentDoneByStoryCount' ],
            filters: [filter]
        };
        
        async.map([config], this.wsapiQuery, function(err,results) {
            myMask.hide();
            console.log("# of features in chart:",results[0].length);
            that.createTable(results[0]);
        });
    },
    
    createTable : function(features) {
        
        // create the store.
        this.store = Ext.create('Ext.data.Store', {
            fields: [
                    { name : "ID" ,     type : "string"},
                    { name : "Name" ,   type : "string"},
                    { name : "Progress",type : "number"}
            ],
            data : this.rows
        });
        
        this.columns = [
            { header : 'ID',        dataIndex: 'ID', width : 50, align : "center", locked:true},
            { header : "Name",      dataIndex : "Name", width : 300,locked:true      },
            { header : "Progress",  align : "center", renderer : this.renderProgress, width : 100,locked:true}, 
        ];
        
        this.grid = Ext.create('Ext.grid.Panel', {
            itemId : 'mygrid',
            store: this.store,
            // width : 1000,
            // height : 600,
            columns: this.columns,
            viewConfig: {
                stripeRows: true
            },
            columnLines: true
        });
        // add it to the app
        if (this.down("#mygrid"))
            this.down("#mygrid").removeAll();
        console.log("adding grid...");
        this.add(this.grid);    

        async.map(features, this.readFeature, function(err,results) {
            //console.log("done!",err,results);
            // extract the team values
            var tValues = _.compact(_.pluck(results,"Teams"));
            // flatten to a list of project id's
            var pOids = [];
            _.each(tValues,function(t){
               pOids = pOids.concat(_.keys(t));
            });
            // group by project (to get the count per project)
            var groupedP = _.groupBy(pOids,function(p) {return p;});
            // sort by number of teams
            var sortedP = _.sortBy( _.keys(groupedP), function(p) { return groupedP[p].length;}).reverse();

            _.each( sortedP, function(p) {
                app.columns.push({  
                    text: p, 
                    header: app.projectName(p), 
                    // dataIndex: p, 
                    flex: 1, 
                    width : 120, 
                    align : 'center', 
                    renderer : app.renderPercentDone });
            });
            app.grid.reconfigure(null,app.columns);
            app.store.load();
        });
        
    },
    
    projectName : function(pid) {
        var project = _.find(this.projects,function(p) { return p.get("ObjectID") == pid; });
        return project ? project.get("Name") : null;
    },
    
    renderProgress : function(value,meta,rec,row,col) {
        return app.renderValue(rec.get("Progress"));
    },
    
    renderPercentDone : function(value,meta,rec,row,col) {
        var p = app.columns[3+col].text;
        return (_.isUndefined(rec.raw.Teams) || _.isUndefined(rec.raw.Teams[p])) 
            ? "" 
            : app.renderValue( rec.raw.Teams[p]);
    },
    
    renderValue : function(v) {
        var id = Ext.id();
        Ext.defer(function () {
            Ext.widget('progressbar', {
                text : ""+Math.round(v)+"%",
                renderTo: id,
                value: v / 100,
            });
        }, 50);
        return Ext.String.format('<div id="{0}"></div>', id);
    },
    
    readFeature : function(feature,callback) {
        var p = feature.get("LeafStoryPlanEstimateTotal") > 0 ?
            (feature.get("AcceptedLeafStoryPlanEstimateTotal") / feature.get("LeafStoryPlanEstimateTotal"))*100 : 0;
        var row = ({ID:feature.get("FormattedID"),Name:feature.get("Name"),Progress:p});
        
        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad : true,
            listeners: {
                scope : this,
                load: function(store, data, success) {
                    var children = _.filter( data, function (d) { return d.get("Children").length == 0;});
                    var grouped = _.groupBy( children, function(child) { return child.get("Project");});
                    _.each( _.keys(grouped), function(key) {
                        var stories = grouped[key];
                        var total = _.reduce( stories, function(memo,child) {return memo + child.get("PlanEstimate");},0)
                        var accepted = _.reduce( stories, function(memo,child) {return memo + ( child.get("ScheduleState")=="Accepted" ? child.get("PlanEstimate") :0);},0)
                        var p = total > 0 ? (accepted/total) * 100 : 0;
                        row["Teams"] = _.isUndefined(row["Teams"]) ? {} : row["Teams"];
                        row["Teams"][key] = p;
                    });
                    //if (!_.isUndefined(row["Teams"]) && _.keys(row["Teams"]).length>1)
                    app.rows.push(row);
                    callback(null,row);
                }
            },
            fetch: ['Project', 'ScheduleState', 'PlanEstimate','Children'],
            hydrate : ['ScheduleState'],
            filters: [
                {
                    property: '_TypeHierarchy',
                    operator: 'in',
                    value: ['HierarchicalRequirement']
                },
                {
                    property: '_ItemHierarchy',
                    operator: 'in',
                    value: [feature.get("ObjectID")]
                },
                {
                    property: '__At',
                    operator: '=',
                    value: 'current'
                }
            ]
        });
    }
});
