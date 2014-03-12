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


