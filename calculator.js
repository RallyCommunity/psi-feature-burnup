Ext.define("MyBurnCalculator", {
   extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",
   
    getMetrics: function () {
        var metrics = [
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
                    var r = _.find(peRecords, function(rec) { return rec.get("ObjectID") == row.PreliminaryEstimate; });
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
            {as: 'Projection', 
            f: function (row, index, summaryMetrics, seriesData) {
                if (index === 0) {
                    datesData = _.pluck(seriesData,"label");
                    var today = new Date();
                    var li = datesData.length-1;
                    acceptedData = _.pluck(seriesData,"Accepted Points");
                    acceptedData = _.filter(acceptedData, function(d,i) { return new Date(Date.parse(datesData[i])) < today; });
                }
                var y = linearProject( acceptedData, index);
                return Math.round(y * 100) / 100;
            }
          } 
        ];
    },
   defined : function(v) {
        return (!_.isUndefined(v) && !_.isNull(v));            
    }
   
});
