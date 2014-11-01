/** this class is configured with { series : [] } where series is a single dimensional array of 
    data values that is filled to full extent of the date range with future values filled with 
    nulls.
**/
Ext.define("ForecastLine", function() {

    var self;
    var data;
    var r;
    var firstProjectionIndex;

    return {
        config : {
            type : "linear", // exponential, logrithmic, power, polynomial
            series : []
        },

        constructor:function(config) {
            self = this;
            this.initConfig(config);
            // convert to an array of data points
            var rseries = _.map(self.series,function(point,index){
                return [index,point];
            });
            return this;
        },

        getProjectionLine : function() {
            return self.createRegressionSeries(self.series);
        },

        createRegressionSeries : function(series) {
            // console.log("series",series);
            var rseries = _.map(series,function(point,index){
                return [index,point];
            });
            var r = regression(self.type,rseries);
            var fpi = _.indexOf(series,null);
            var lpi = fpi - 1;
            // console.log("fpi",fpi);
            var p =  _.map(r.points,function(point,index) {
                return index < fpi-1 ? null : r.points[index][1];
            });
            p = _.map(p,function(value){ return !_.isNaN(value) ? value : null;});
            var offset = !_.isNull(series[lpi]) && !_.isNull(p[lpi]) ? (series[lpi] - p[lpi]) : 0;
            // console.log(series[lpi],p[lpi],offset);
            var proj = _.map(p,function(point,x) {
                return !_.isNull(point) && x >= lpi ? (point+offset) : point;
            });         
            return proj;
        },

        // return a set of projection lines each based on the specified index into the series
        getProjectionLineAtIndices : function (indices) {
            return _.map(indices,function(index) {
                var s = _.map(self.series,function(v,x) {
                    return x < index ? v : null;
                });
                var p = self.createRegressionSeries(s);
                return p;
            });
        }
    };
   
});
