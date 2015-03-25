/*
 *  FirebaseTransport.js
 *
 *  David Janes
 *  IOTDB.org
 *  2015-03-07
 *
 *  Copyright [2013-2015] [David P. Janes]
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

"use strict";

var iotdb = require('iotdb');
var _ = iotdb._;
var bunyan = iotdb.bunyan;

var firebase = require('firebase');

var util = require('util');
var url = require('url');

var logger = bunyan.createLogger({
    name: 'iotdb-transport-firebase',
    module: 'FirebaseTransport',
});

/**
 *  Create a transport for FireBase.
 */
var FirebaseTransport = function (initd) {
    var self = this;

    self.initd = _.defaults(
        initd,
        iotdb.keystore().get("/transports/FirebaseTransport/initd"),
        {
            prefix: "/",
            host: null
        }
    );

    self.initd.parts = _split(self.initd.prefix);

    self.native = new firebase(self.initd.host);
};

/**
 */
FirebaseTransport.prototype.list = function(paramd, callback) {
    var self = this;

    if (arguments.length === 1) {
        paramd = {};
        callback = arguments[0];
    }

    var channel = self._channel();
    self.native.child(channel).orderByKey().on("child_added", function(snapshot) {
        callback([ snapshot.key(), ]);
    });
};

/**
 */
FirebaseTransport.prototype.get = function(id, band, callback) {
    var self = this;

    if (!id) {
        throw new Error("id is required");
    }
    if (!band) {
        throw new Error("band is required");
    }

    var channel = self._channel(id, band);
    self.native.child(channel).once("value", function(snapshot) {
        callback(id, band, _pack_in(snapshot.val()));
    });
};

/**
 */
FirebaseTransport.prototype.update = function(id, band, value) {
    var self = this;

    if (!id) {
        throw new Error("id is required");
    }
    if (!band) {
        throw new Error("band is required");
    }

    var channel = self._channel(id, band);
    var d = _pack_out(value);

    self.native.child(channel).set(d);
};

/**
 */
FirebaseTransport.prototype.updated = function(id, band, callback) {
    var self = this;

    if (arguments.length === 1) {
        id = null;
        band = null;
        callback = arguments[0];
    } else if (arguments.length === 2) {
        band = null;
        callback = arguments[1];
    }

    var channel = self._channel(id, band);
    self.native.child(channel).on("child_changed", function (snapshot, name) {
        var snapshot_url = snapshot.ref().toString();
        var snapshot_path = url.parse(snapshot_url).path;
        var snapshot_parts = _split(snapshot_path);
        
        var parts = self.initd.parts;
        var diff = snapshot_parts.length - parts.length;
        if (diff > 2) {
            var snapshot_id = _decode(snapshot_parts[parts.length]);
            var snapshot_band = _decode(snapshot_parts[parts.length + 1]);
            var snapshot_value = undefined;
            callback(snapshot_id, snapshot_band, snapshot_value);
        } else if (diff === 2) {
            var snapshot_id = _decode(snapshot_parts[parts.length]);
            var snapshot_band = _decode(snapshot_parts[parts.length + 1]);
            var snapshot_value = _pack_in(snapshot.val());
            callback(snapshot_id, snapshot_band, snapshot_value);
        } else if (diff === 1) {
            var snapshot_id = _decode(snapshot_parts[parts.length]);
            var d = _pack_in(snapshot.val());
            for (var snapshot_band in d) {
                var snapshot_value = d[snapshot_band];
                callback(snapshot_id, snapshot_band, snapshot_value);
            }
        } else {
            /* ignoring massive udpates */
        }
    });
};

/**
 */
FirebaseTransport.prototype.remove = function(id, band) {
    var self = this;

    if (!id) {
        throw new Error("id is required");
    }

    var channel = self._channel(id, band);
    self.native.child(channel).remove();
};

/* -- internals -- */
FirebaseTransport.prototype._channel = function(id, band) {
    var self = this;

    var parts = _.deepCopy(self.initd.parts);
    if (id) {
        parts.push(_encode(id));
    }
    if (band) {
        parts.push(_encode(band));
    }

    return parts.join("/");
};

var _encode = function(s) {
    return s.replace(/[\/$#.\]\[]/g, function(c) {
        return '%' + c.charCodeAt(0).toString(16);
    });
};

var _decode = function(s) {
    return decodeURIComponent(s);
}

var _pack_out = function(d) {
    var outd = {};
    var d = _.ld.compact(d);

    for (var key in d) {
        var value = d[key];
        var okey = _encode(key);

        outd[okey] = value;
    }

    return outd;
};

/* this should be made recursive */
var _pack_in = function(d) {
    var ind = {};

    for (var key in d) {
        var value = d[key];
        ind[_decode(key)] = value;
    }

    return ind;
};

var _split = function(path) {
    var nparts = [];
    var oparts = path.split("/");

    for (var pi in oparts) {
        var part = oparts[pi];
        if (part.length > 0) {
            nparts.push(part);
        }
    }

    return nparts;
}

/**
 *  API
 */
exports.FirebaseTransport = FirebaseTransport;

/*
var t = new FirebaseTransport({
    prefix: "sample"
});
console.log(t.initd)

t.update("MyThing", "istate", { name: "hi" });
 */
