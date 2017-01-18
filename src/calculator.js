Ext.define("MyBurnCalculator", function() {

    var self;

    return {

        extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",

        config : {
            series : [],
            ignoreZeroValues : true,
            flatScopeProjection : false,
            peRecords : []
        },

        constructor:function(config) {
            self = this;
            this.initConfig(config);
            return this;
        },

        pointsOffset : [],
        countOffset : [],
        data : [],
        lastAccepted : [],
        indexOffset : [],

        getMetrics: function () {

            // get the set of non-projection metrics
            var nonProjectionMetrics = _.filter(self.series,function(s) {
               return s.name.indexOf("Projection")==-1;
            });

            var metrics = _.map( nonProjectionMetrics, function(m) {
                return {
                    field : m.field,
                    as : m.description,
                    display : m.display,
                    f : m.f
                };
            });

            return metrics;
        },

        getDerivedFieldsOnInput : function () {
            // XS 1, S 3, M 5, L 8, XL 13
            return [
                {
                    as: 'CalcPreliminaryEstimate',
                    f:  function(row) {
                        var r = _.find(self.peRecords, function(rec) { return rec.get("ObjectID") == row.PreliminaryEstimate; });
                        var v = r !== undefined ? r.get("Value") : 0;
                        return v;
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

        getMidPointIndex : function(dateSeries) {

            var today = new Date();

            var tdi = _.findIndex(dateSeries,function(d) {
                return ( today.setHours(0,0,0,0) === new Date(Date.parse(d)).setHours(0,0,0,0))
            });

            return tdi !== -1 ? Math.round(tdi/2) : -1;

        },

        line_intersect : function(seg1,seg2)
        {
            console.log("seg1",seg1);
            console.log("seg2",seg2);

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
        },

        calcCompletionIndex1 : function(pointsOrCount) {

            var that = this;
            var scopeProjection = pointsOrCount=="Count" ? "StoryCountProjection" : "StoryPointsProjection"
            var completedProjection = pointsOrCount=="Count" ? "AcceptedCountProjection" : "AcceptedPointsProjection"

            var lineSegment = function(series) {
                var data = that.data[series];
                console.log("data series",data);
                var x1 = _.findIndex(data,function(d){return !_.isNull(d);});
                var y1 = data[x1];
                var x2 = data.length-1;
                var y2 = data[x2];
                return {x1:x1,y1:y1,x2:x2,y2:y2};
            }

            return self.line_intersect(
                lineSegment(scopeProjection),
                lineSegment(completedProjection));

        },

        calcCompletionIndex : function(seriesName) {

            // StoryPointsProjection
            // StoryCountProjection
            // AcceptedPointsProjection
            // AcceptedCountProjection

            var points = 1000;

            var createProjectionArray = function(data,flatValue) {
                var x = 0;
                var arr = [];
                do {
                    if (_.isUndefined(flatValue) || _.isNull(flatValue))
                        arr.push(linearProject(data, x))
                    else
                        arr.push(flatValue);
                    x = x + 1;
                } while(x < points)
                // adjust by last point
                var dy = _.last(data) - arr[(data.length-1)];
                _.each(arr,function(value,i) { 
                    arr[i] = value + dy;
                })
                return arr;
            }

            var that = this;

            var scopeSeries = seriesName=="AcceptedCountProjection" ? "StoryCountProjection" : "StoryPointsProjection"

            var completedSet = that.data[seriesName];
            var scopeSet = that.data[scopeSeries]
            
            var cProjection = createProjectionArray(completedSet);
            var sProjection = createProjectionArray(scopeSet, self.flatScopeProjection===true 
                ? _.last(scopeSet) 
                : null);
            var x = completedSet.length-1;
            do {
                x = x + 1;
            } while( x < points && cProjection[x] < sProjection[x] );
            console.log("completed index:",x);
            if (x == points)
                return "Undetermined"
            else {
                return (businessDaysFromDate(new Date(), (x-completedSet.length-1))).toLocaleDateString();
            }
        },

        calcProjectionPoint : function(seriesName,projectOn,row, index, summaryMetrics, seriesData, projectFrom) {

            var that = this;

            // for first point we save the data set on which we are going to do the linear projection on
            // we also optionally filter out values.
            if (index === 0) {
                datesData = _.pluck(seriesData,"label");
                var mid = self.getMidPointIndex(datesData);
                var today = new Date();
                var li = datesData.length-1;

                // that.data[seriesName] = _.pluck(seriesData,seriesName);
                that.data[seriesName] = _.pluck(seriesData,projectOn);
                // if (seriesName==="Story Points") console.log(that.data[seriesName].length);
                // filter to just values before today
                that.data[seriesName] = _.filter(
                    that.data[seriesName], function(d,i) {
                        if (!_.isUndefined(projectFrom) && projectFrom==="mid") {
                            return (i < mid);
                        } else {
                            return new Date(Date.parse(datesData[i])) < today;
                        }
                    }
                );
                // if (seriesName==="Story Points") console.log(that.data[seriesName].length);
                // optionally remove zero values
                var dx = that.data[seriesName].length;
                if (self.ignoreZeroValues===true) {
                    that.data[seriesName] = _.filter(
                        that.data[seriesName], function(d,i) {
                            return d !== 0;
                        }
                    );
                }
                // if (seriesName==="Story Points") console.log(that.data[seriesName].length);
                // if we do remove values from the data set then we need to save an offset
                // so we are calculating the projection on the revised length
                var dy = that.data[seriesName].length;
                that.indexOffset[seriesName] = dx - dy;

                // calculate an offset between the projected value and the actual accepted values.
                that.lastAccepted[seriesName] = that.data[seriesName][that.data[seriesName].length-1];
                console.log("lastAccepted",that.lastAccepted[seriesName],seriesName);
                var lastProjected = linearProject( that.data[seriesName], that.data[seriesName].length-1);
                // if (seriesName==="Story Points")
                //     console.log("la",lastAccepted,"lp",lastProjected);
                that.pointsOffset[seriesName] = that.lastAccepted[seriesName]-lastProjected;
            }
            index = index - that.indexOffset[seriesName];
            var y = linearProject( that.data[seriesName], index) + that.pointsOffset[seriesName];
            // use the last value if the flat scope projection setting is true
            // console.log("flatScopeProjection",self.flatScopeProjection,seriesName,that.lastAccepted[seriesName]);
            if (self.flatScopeProjection===true) {
                if (seriesName=="StoryPointsProjection" || seriesName=="StoryCountProjection")
                    y = that.lastAccepted[seriesName];
            }
            return Math.round(y * 100) / 100;
        },

        getDerivedFieldsAfterSummary : function () {

            // get the set of projection metrics
            var projectionMetrics = _.filter(self.series,function(s) {
                return s.name.indexOf("Projection")!==-1;
            });

            var metrics = _.map( projectionMetrics, function(m) {
                return {
                    as : m.description,
                    projectOn : m.projectOn,
                    projectFrom : m.projectFrom,
                    name : m.name,
                    f : function(row,index,summaryMetrics,seriesData) {
                        var p = self.calcProjectionPoint(this.name,this.projectOn,row,index,summaryMetrics,seriesData,this.projectFrom);
                        return p;
                    }
                };
            });
            return metrics;

        },

        defined : function(v) {
            return (!_.isUndefined(v) && !_.isNull(v));
        }
    };
   
});
