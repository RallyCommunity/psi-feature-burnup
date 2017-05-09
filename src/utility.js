// utility methods

// returns the release name if the app is on a page scoped to a release.
function getReleaseTimeBox(app) {
    var timeboxScope = app.getContext().getTimeboxScope();
    var tbName = null;
    if(timeboxScope) {
        var record = timeboxScope.getRecord();
        tbName = record.get('Name');
    } else {
        tbName = "";
    }
    return tbName;
}

// generic function to perform a web services query    
function wsapiQuery( config , callback ) {
	
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
}

function snapshotQuery( config ,callback) {

    var storeConfig = {
        find    : config.find,
        fetch   : config.fetch,
        hydrate : config.hydrate,
        autoLoad : true,
        pageSize : 10000,
        limit    : 'Infinity',
        listeners : {
            scope : this,
            load  : function(store,snapshots,success) {
                console.log("snapshots:",snapshots.length);
                callback(null,snapshots);
            }
        }
    };
    var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', storeConfig);

}

function pointsUnitType(type) {
        return type=="Points";
}

function createSeriesArray() {
    return [
        { name : "PreliminaryEstimate",      description : "Preliminary Estimate",  field : "CalcPreliminaryEstimate",    display : "line", f : "sum", color : "Orange" },
        { name : "StoryPoints" ,             description : "Story Points",          field : "LeafStoryPlanEstimateTotal", display : "line", f : "sum", color : "DarkGray" },
        { name : "StoryCount"  ,             description : "Story Count" ,          field : "LeafStoryCount",             display : "line", f : "sum", color : "DarkGray" },
        { name : "StoryPointsProjection",    description : "Scope Projection",  projectOn : "Story Points", color : "DarkGray" },
        { name : "StoryCountProjection",     description : "Count Projection",  projectOn : "Story Count",  color : "DarkGray" },
        { name : "AcceptedStoryPoints",      description : "Accepted Points",       field : "AcceptedLeafStoryPlanEstimateTotal", display : "line", f : "sum", color : "Green" },
        { name : "AcceptedStoryCount",       description : "Accepted Count",        field : "AcceptedLeafStoryCount",  display : "line", f : "sum", color : "Green" },
        { name : "AcceptedPointsProjection", description : "Accepted Projection", projectOn : "Accepted Points",        color : "Green" },
        { name : "AcceptedCountProjection",  description : "Accepted Count Projection", projectOn : "Accepted Count",   color : "Green" },
        { name : "FeatureCount",             description : "Feature Count",          field : "ObjectID",                display : "column", f : "count", color : "Blue" },
        { name : "FeatureCountCompleted",    description : "Completed Feature Count",field : "Completed",               display : "column", f : "sum", color : "Green" },
        { name : "FeatureCountProjection",   description : "Feature Count Projection", projectOn : "Completed Feature Count",   color : "Green" },
        { name : "HistoricalProjection",     description : "Historical Trend Projection",projectOn : "Accepted Points", color : "LightGray", hidden : true, projectFrom : "mid" },
        { name : "RefinedEstimate" ,         description : "Refined Feature Estimate", field : "RefinedEstimate", display : "line", f : "sum", color : "DarkBlue" }
    ];
}

function createColorsArray( series ) {

    var colors = [];

    _.each( series, function(s,i) {
        if (i>0) {
            var as = _.find( app.series, function(a) {
                return a.description === s.name;
            });
            if (!_.isUndefined(as)) {
                colors.push(as.color);    
            } else {
                colors.push("LightGray");
            }
            
        }
    });

    return colors;

}


function trimHighChartsConfig(hc) {

    // trim future values
    var today = new Date();
    _.each(hc, function(series,i) {
        // for non-projection values dont chart after today
        if (series.name.indexOf("Projection")===-1 && series.name.indexOf("label") ===-1 ) {
            _.each( series.data, function( point , x ){
                if ( Date.parse(hc[0].data[x]) > today )
                    series.data[x] = null;
            });
        }
        // for projection null values before today.
        if (series.name.indexOf("Projection")!==-1) {
            _.each( series.data, function( point , x ){
                if ( Date.parse(hc[0].data[x]) < today ) {
                    series.data[x] = null;

                }
            });
//                series.color = "#C8C8C8";
            series.dashStyle = 'dash';
        }

    });

    return hc;
}

function businessDaysFromDate(date,businessDays) {
  var counter = 0, tmp = new Date(date);
  while( businessDays>=0 ) {
    tmp.setTime( date.getTime() + counter * 86400000 );
    if(isBusinessDay (tmp)) {
      --businessDays;
    }
    ++counter;
  }
  return tmp;
}

function isBusinessDay (date) {
  var dayOfWeek = date.getDay();
  if(dayOfWeek === 0 || dayOfWeek === 6) {
    // Weekend
    return false;
  }

  return true;
}


function line_intersect (seg1,seg2)
{

    var x1 = seg1.x1; var y1 = seg1.y1; var x2 = seg1.x2; var y2 = seg1.y2;
    var x3 = seg2.x1; var y3 = seg2.y1; var x4 = seg2.x2; var y4 = seg2.y2;

    var ua, ub, denom = (y4 - y3)*(x2 - x1) - (x4 - x3)*(y2 - y1);
    if (denom == 0) {
        return null;
    }
    ua = ((x4 - x3)*(y1 - y3) - (y4 - y3)*(x1 - x3))/denom;
    ub = ((x2 - x1)*(y1 - y3) - (y2 - y1)*(x1 - x3))/denom;
    return {
        x: x1 + ua*(x2 - x1),
        y: y1 + ua*(y2 - y1),
        seg1: ua >= 0 && ua <= 1,
        seg2: ub >= 0 && ua <= 1
    };
}

function calcCompletionIndex1 (series,pointsOrCount) {

        var that = this;
        var scopeProjection = pointsOrCount=="Points" ? "Scope Projection" : "Count Projection"
        var completedProjection = pointsOrCount=="Points" ? "Accepted Projection" : "Accepted Count Projection"

        var lineSegment = function(data) {
            var x1 = _.findIndex(data,function(d){return !_.isNull(d);});
            var y1 = data[x1];
            var x2 = data.length-1;
            var y2 = data[x2];
            return {x1:x1,y1:y1,x2:x2,y2:y2};
        }

        console.log("series",series);
        console.log(scopeProjection,completedProjection);
        var scopeProjectionData = _.find(series,function(s) { return s.name == scopeProjection;});
        var completedProjectionData = _.find(series,function(s) { return s.name == completedProjection;});
        if (!scopeProjectionData || !completedProjectionData)
            return "No Projection Data";

        console.log(scopeProjectionData);
        console.log(completedProjectionData);
        var intersect = line_intersect(
            lineSegment(scopeProjectionData.data),
            lineSegment(completedProjectionData.data));

        console.log("intersect",intersect);
        var completionIndex = Math.floor(intersect.x);

        if (_.isNaN(intersect.x) || (intersect.x < 0)) {
            return "Unknown"
        }

        if (completionIndex <= scopeProjectionData.data.length-1)
            return series[0].data[completionIndex]; // date label
        else {
            // convert last chart date label to a date, and add the business days.
            console.log("series",series);
            var dt = new Date(_.last(series[0].data))
            var futureDays = (completionIndex-scopeProjectionData.data.length-1);
            var futureDt = businessDaysFromDate(dt,futureDays);
            return futureDt.toLocaleDateString();;
        }
}
