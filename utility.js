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
