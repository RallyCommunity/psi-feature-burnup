function LineFitter()
{
    this.count = 0;
    this.sumX = 0;
    this.sumX2 = 0;
    this.sumXY = 0;
    this.sumY = 0;
}

LineFitter.prototype = {
    'add': function(x, y)
    {
        this.count++;
        this.sumX += x;
        this.sumX2 += x*x;
        this.sumXY += x*y;
        this.sumY += y;
    },
    'project': function(x)
    {
        var det = this.count * this.sumX2 - this.sumX * this.sumX;
        var offset = (this.sumX2 * this.sumY - this.sumX * this.sumXY) / det;
        var scale = (this.count * this.sumXY - this.sumX * this.sumY) / det;
        return offset + x * scale;
    }
};

function linearProject(data, x)
{

    var fitter = new LineFitter();
    for (var i = 0; i < data.length; i++)
    {
        fitter.add(i, data[i]);
    }
    return fitter.project(x);
}

function projectToZero( data, x) {

    var start = x;

    while ( linearProject(data,start) > 0)
        start = start + 1;

    return start;

}

// var data = [null, null, null, null, null, 292, 292, 292, 292, 292, 292, 292, 292, 292, 292, 292, 292, 292, 292, 331, 299, 299, 299, 299, 299, 299, 299, 299];

// console.log(
//     linearProject(
//         _.filter(data,function(d) { return d !== null;}),
//         0));

