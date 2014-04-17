Ext.define("MyBurnCalculator", function() {

    var self;

    return {

        extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",

        config : {
            series : []
        },

        constructor:function(config) {
            self = this;
            this.initConfig(config);
            return this;
        },

        pointsOffset : [],
        countOffset : [],
        acceptedPointsData : [],

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
                        var r = _.find(app.peRecords, function(rec) { return rec.get("ObjectID") == row.PreliminaryEstimate; });
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

        calcProjectionPoint : function(seriesName,row, index, summaryMetrics, seriesData) {
            var that = this;
            if (index === 0) {
                datesData = _.pluck(seriesData,"label");
                var today = new Date();
                var li = datesData.length-1;

                that.acceptedPointsData[seriesName] = _.pluck(seriesData,seriesName);
                that.acceptedPointsData[seriesName] = _.filter(
                    that.acceptedPointsData[seriesName], function(d,i) {
                        return new Date(Date.parse(datesData[i])) < today;
                    }
                );

                // calculate an offset between the projected value and the actual accepted values.
                var lastAccepted = that.acceptedPointsData[seriesName][that.acceptedPointsData[seriesName].length-1];
                var lastProjected = linearProject( that.acceptedPointsData[seriesName], that.acceptedPointsData[seriesName].length-1);
                that.pointsOffset[seriesName] = lastAccepted-lastProjected;
            }
            var y = linearProject( that.acceptedPointsData[seriesName], index) + that.pointsOffset[seriesName];
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
                    f : function(row,index,summaryMetrics,seriesData) {
                        var p = self.calcProjectionPoint(this.projectOn,row,index,summaryMetrics,seriesData);
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
