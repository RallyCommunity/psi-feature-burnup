Ext.define('TSStringFilter',{
    extend: 'Rally.data.QueryFilter',
    config: {
        query_string: ''
    },
    constructor: function(config) {
        this.mergeConfig(config);
        this.callParent([this.config]);
    },
    _createQueryString: function(property, operator, value) {
        this.filter = this.fromQueryString(this.query_string);
        return this.filter.toString();
    },
    /**
     * Converts a query string into a Rally compatible QueryFilter
     * @static
     * @param {String} query The query string to convert into a QueryFilter
     * @return {Rally.data.wsapi.Filter} A Rally.data.wsapi.Filter that will convert back to a query string if toString() is called
     */
    fromQueryString: function (query) {
        var parser = Ext.create('Rally.data.util.QueryStringParser', {
            string: query
        });

        var initial_expression = parser.parseExpression();
        return initial_expression;
    }
});