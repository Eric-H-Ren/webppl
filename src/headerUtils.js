'use strict';

var _ = require('underscore');
var serialize = require('./util').serialize
var Tensor = require('./tensor');
var fs = require('fs');
var child_process = require('child_process');
var LRU = require('lru-cache');
var ad = require('./ad');

module.exports = function(env) {

  function display(s, k, a, x) {
    return k(s, console.log(ad.valueRec(x)));
  }

  // Caching for a wppl function f.
  //
  // Caution: if f isn't deterministic weird stuff can happen, since
  // caching is across all uses of f, even in different execuation
  // paths.
  function cache(s, k, a, f, maxSize) {
    var c = LRU(maxSize);
    var cf = function(s, k, a) {
      var args = Array.prototype.slice.call(arguments, 3);
      var stringedArgs = serialize(args);
      if (c.has(stringedArgs)) {
        return k(s, c.get(stringedArgs));
      } else {
        var newk = function(s, r) {
          if (c.has(stringedArgs)) {
            // This can happen when cache is used on recursive functions
            console.log('Already in cache:', stringedArgs);
            if (serialize(c.get(stringedArgs)) !== serialize(r)) {
              console.log('OLD AND NEW CACHE VALUE DIFFER!');
              console.log('Old value:', c.get(stringedArgs));
              console.log('New value:', r);
            }
          }
          c.set(stringedArgs, r);
          if (!maxSize && c.length === 1e4) {
            console.log(c.length + ' function calls have been cached.');
            console.log('The size of the cache can be limited by calling cache(f, maxSize).');
          }
          return k(s, r);
        };
        return f.apply(this, [s, newk, a].concat(args));
      }
    };
    return k(s, cf);
  }

  function apply(s, k, a, wpplFn, args) {
    return wpplFn.apply(global, [s, k, a].concat(args));
  }

  // Annotating a function object with its lexical id and
  //    a list of its free variable values.
  var __uniqueid = 0;
  var _Fn = {
    tag: function(fn, lexid, freevarvals) {
      fn.__lexid = lexid;
      fn.__uniqueid = __uniqueid++;
      fn.__freeVarVals = freevarvals;
      return fn;
    }
  };

  var Vector = function(s, k, a, arr) {
    return k(s, new Tensor([arr.length, 1]).fromFlatArray(arr));
  };

  var Matrix = function(s, k, a, arr) {
    return k(s, new Tensor([arr.length, arr[0].length]).fromArray(arr));
  };

  var zeros = function(s, k, a, dims) {
    return k(s, new Tensor(dims));
  };

  // Provides a convinient wrapper around the primitive registerParams.
  // Will be simplified once all params are tensor valued.
  var param = function(s, k, a, arg1, arg2, arg3) {
    var name = env.getRelativeAddress(a);
    var params = env.registerParams(name, function() {
      var val;
      // TODO: Init. from Gaussian.
      if (_.isArray(arg1)) {
        // param(dims, mean, std)
        val = new Tensor(arg1).fill(arg2);
      } else {
        // param(mean, std)
        val = arg1;
      }
      // Wrap as `registerParams` tracks an array of parameters for
      // each name/address.
      return [val];
    });
    return k(s, params[0]);
  };

  function getRelativeAddress(s, k, a) {
    return k(s, env.getRelativeAddress(a));
  }

  return {
    display: display,
    cache: cache,
    apply: apply,
    _Fn: _Fn,
    Vector: Vector,
    Matrix: Matrix,
    zeros: zeros,
    param: param,
    getRelativeAddress: getRelativeAddress
  };

};
