Ext.define("MyBurnCalculator", {
   extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",
   
    pointsOffset : 0,
    countOffset : 0,
   
    getMetrics: function () {
        var metrics = [
           {
               field: "LeafStoryCount",
               as: "Planned Count",
               display: "line",
               f: "sum"
           },
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
              field: "AcceptedLeafStoryCount",
              as: "Accepted Count",
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
    getDerivedFieldsAfterSummary : function () {
        return [
            {as: 'ProjectionPoints', 
            f: function (row, index, summaryMetrics, seriesData) {
                var that = this;
                if (index === 0) {
                    datesData = _.pluck(seriesData,"label");
                    var today = new Date();
                    var li = datesData.length-1;
                    acceptedPointsData = _.pluck(seriesData,"Accepted Points");
                    acceptedPointsData = _.filter(acceptedPointsData, function(d,i) { return new Date(Date.parse(datesData[i])) < today; });
                    
                    // calculate an offset between the projected value and the actual accepted values.
                    var lastAccepted = acceptedPointsData[acceptedPointsData.length-1];
                    var lastProjected = linearProject( acceptedPointsData, acceptedPointsData.length-1);
                    console.log("last accepted:", lastAccepted, "last projected:",lastProjected);
                    that.pointsOffset = lastAccepted-lastProjected;    
                }
                var y = linearProject( acceptedPointsData, index) + that.pointsOffset;
                return Math.round(y * 100) / 100;
            }
          }, 
          {as: 'ProjectionCount', 
            f: function (row, index, summaryMetrics, seriesData) {
                var that = this;
                if (index === 0) {
                    datesData = _.pluck(seriesData,"label");
                    var today = new Date();
                    var li = datesData.length-1;
                    acceptedCountData = _.pluck(seriesData,"Accepted Count");
                    acceptedCountData = _.filter(acceptedCountData, function(d,i) { return new Date(Date.parse(datesData[i])) < today; });
                    // calculate an offset between the projected value and the actual accepted values.
                    var lastAccepted = acceptedCountData[acceptedCountData.length-1];
                    var lastProjected = linearProject( acceptedCountData, acceptedCountData.length-1);
                    console.log("last accepted:", lastAccepted, "last projected:",lastProjected);
                    that.countOffset = lastAccepted-lastProjected;    

                }
                var y = linearProject( acceptedCountData, index) + that.countOffset;
                return Math.round(y * 100) / 100;
            }
          } 

        ];
    },
   defined : function(v) {
        return (!_.isUndefined(v) && !_.isNull(v));            
    }
   
});
