'use strict';

/**
 * https://github.com/gre/bezier-easing
 * BezierEasing - use bezier curve for transition easing function
 * by Gaëtan Renaudeau 2014 - 2015 – MIT License
 */

// These values are established by empiricism with tests (tradeoff: performance VS precision)
var NEWTON_ITERATIONS = 4;
var NEWTON_MIN_SLOPE = 0.001;
var SUBDIVISION_PRECISION = 0.0000001;
var SUBDIVISION_MAX_ITERATIONS = 10;

var kSplineTableSize = 11;
var kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

var float32ArraySupported = typeof Float32Array === 'function';

function A (aA1, aA2) { return 1.0 - 3.0 * aA2 + 3.0 * aA1; }
function B (aA1, aA2) { return 3.0 * aA2 - 6.0 * aA1; }
function C (aA1)      { return 3.0 * aA1; }

// Returns x(t) given t, x1, and x2, or y(t) given t, y1, and y2.
function calcBezier (aT, aA1, aA2) { return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT; }

// Returns dx/dt given t, x1, and x2, or dy/dt given t, y1, and y2.
function getSlope (aT, aA1, aA2) { return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1); }

function binarySubdivide (aX, aA, aB, mX1, mX2) {
  var currentX, currentT, i = 0;
  do {
    currentT = aA + (aB - aA) / 2.0;
    currentX = calcBezier(currentT, mX1, mX2) - aX;
    if (currentX > 0.0) {
      aB = currentT;
    } else {
      aA = currentT;
    }
  } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
  return currentT;
}

function newtonRaphsonIterate (aX, aGuessT, mX1, mX2) {
 for (var i = 0; i < NEWTON_ITERATIONS; ++i) {
   var currentSlope = getSlope(aGuessT, mX1, mX2);
   if (currentSlope === 0.0) {
     return aGuessT;
   }
   var currentX = calcBezier(aGuessT, mX1, mX2) - aX;
   aGuessT -= currentX / currentSlope;
 }
 return aGuessT;
}

var index$2 = function bezier (mX1, mY1, mX2, mY2) {
  if (!(0 <= mX1 && mX1 <= 1 && 0 <= mX2 && mX2 <= 1)) {
    throw new Error('bezier x values must be in [0, 1] range');
  }

  // Precompute samples table
  var sampleValues = float32ArraySupported ? new Float32Array(kSplineTableSize) : new Array(kSplineTableSize);
  if (mX1 !== mY1 || mX2 !== mY2) {
    for (var i = 0; i < kSplineTableSize; ++i) {
      sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
    }
  }

  function getTForX (aX) {
    var intervalStart = 0.0;
    var currentSample = 1;
    var lastSample = kSplineTableSize - 1;

    for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
      intervalStart += kSampleStepSize;
    }
    --currentSample;

    // Interpolate to provide an initial guess for t
    var dist = (aX - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    var guessForT = intervalStart + dist * kSampleStepSize;

    var initialSlope = getSlope(guessForT, mX1, mX2);
    if (initialSlope >= NEWTON_MIN_SLOPE) {
      return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
    } else if (initialSlope === 0.0) {
      return guessForT;
    } else {
      return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2);
    }
  }

  return function BezierEasing (x) {
    if (mX1 === mY1 && mX2 === mY2) {
      return x; // linear
    }
    // Because JavaScript number are imprecise, we should guarantee the extremes are right.
    if (x === 0) {
      return 0;
    }
    if (x === 1) {
      return 1;
    }
    return calcBezier(getTForX(x), mY1, mY2);
  };
};

// Predefined set of animations. Similar to CSS easing functions
var animations = {
  ease:  index$2(0.25, 0.1, 0.25, 1),
  easeIn: index$2(0.42, 0, 1, 1),
  easeOut: index$2(0, 0, 0.58, 1),
  easeInOut: index$2(0.42, 0, 0.58, 1),
  linear: index$2(0, 0, 1, 1)
};


var index$1 = animate;

function animate(source, target, options) {
  var start= Object.create(null);
  var diff = Object.create(null);
  options = options || {};
  // We let clients specify their own easing function
  var easing = (typeof options.easing === 'function') ? options.easing : animations[options.easing];

  // if nothing is specified, default to ease (similar to CSS animations)
  if (!easing) {
    if (options.easing) {
      console.warn('Unknown easing function in amator: ' + options.easing);
    }
    easing = animations.ease;
  }

  var step = typeof options.step === 'function' ? options.step : noop;
  var done = typeof options.done === 'function' ? options.done : noop;

  var scheduler = getScheduler(options.scheduler);

  var keys = Object.keys(target);
  keys.forEach(function(key) {
    start[key] = source[key];
    diff[key] = target[key] - source[key];
  });

  var durationInMs = options.duration || 400;
  var durationInFrames = Math.max(1, durationInMs * 0.06); // 0.06 because 60 frames pers 1,000 ms
  var previousAnimationId;
  var frame = 0;

  previousAnimationId = scheduler.next(loop);

  return {
    cancel: cancel
  }

  function cancel() {
    scheduler.cancel(previousAnimationId);
    previousAnimationId = 0;
  }

  function loop() {
    var t = easing(frame/durationInFrames);
    frame += 1;
    setValues(t);
    if (frame <= durationInFrames) {
      previousAnimationId = scheduler.next(loop);
      step(source);
    } else {
      previousAnimationId = 0;
      setTimeout(function() { done(source); }, 0);
    }
  }

  function setValues(t) {
    keys.forEach(function(key) {
      source[key] = diff[key] * t + start[key];
    });
  }
}

function noop() { }

function getScheduler(scheduler) {
  if (!scheduler) {
    var canRaf = typeof window !== 'undefined' && window.requestAnimationFrame;
    return canRaf ? rafScheduler() : timeoutScheduler()
  }
  if (typeof scheduler.next !== 'function') throw new Error('Scheduler is supposed to have next(cb) function')
  if (typeof scheduler.cancel !== 'function') throw new Error('Scheduler is supposed to have cancel(handle) function')

  return scheduler
}

function rafScheduler() {
  return {
    next: window.requestAnimationFrame.bind(window),
    cancel: window.cancelAnimationFrame.bind(window)
  }
}

function timeoutScheduler() {
  return {
    next: function(cb) {
      return setTimeout(cb, 1000/60)
    },
    cancel: function (id) {
      return clearTimeout(id)
    }
  }
}

var index = function (elem, centerIfNeeded, options, finalElement) {
  
  if (!elem) throw new Error('Element is required in scrollIntoViewIfNeeded')
  
  function withinBounds(value, min, max, extent) {
      if (false === centerIfNeeded || max <= value + extent && value <= min + extent) {
          return Math.min(max, Math.max(min, value));
      } else {
          return (min + max) / 2;
      }
  }

  function makeArea(left, top, width, height) {
      return  { "left": left, "top": top, "width": width, "height": height
              , "right": left + width, "bottom": top + height
              , "translate":
                  function (x, y) {
                      return makeArea(x + left, y + top, width, height);
                  }
              , "relativeFromTo":
                  function (lhs, rhs) {
                      var newLeft = left, newTop = top;
                      lhs = lhs.offsetParent;
                      rhs = rhs.offsetParent;
                      if (lhs === rhs) {
                          return area;
                      }
                      for (; lhs; lhs = lhs.offsetParent) {
                          newLeft += lhs.offsetLeft + lhs.clientLeft;
                          newTop += lhs.offsetTop + lhs.clientTop;
                      }
                      for (; rhs; rhs = rhs.offsetParent) {
                          newLeft -= rhs.offsetLeft + rhs.clientLeft;
                          newTop -= rhs.offsetTop + rhs.clientTop;
                      }
                      return makeArea(newLeft, newTop, width, height);
                  }
              };
  }

  var parent, area = makeArea(
      elem.offsetLeft, elem.offsetTop,
      elem.offsetWidth, elem.offsetHeight);
  while ((parent = elem.parentNode) instanceof HTMLElement && elem !== finalElement) {
      var clientLeft = parent.offsetLeft + parent.clientLeft;
      var clientTop = parent.offsetTop + parent.clientTop;

      // Make area relative to parent's client area.
      area = area.
          relativeFromTo(elem, parent).
          translate(-clientLeft, -clientTop);

      var scrollLeft = withinBounds(
          parent.scrollLeft,
          area.right - parent.clientWidth, area.left,
          parent.clientWidth);
      var scrollTop = withinBounds(
          parent.scrollTop,
          area.bottom - parent.clientHeight, area.top,
          parent.clientHeight);
      if(options) {
        index$1(parent, {
           scrollLeft: scrollLeft,
          scrollTop: scrollTop
        }, options);
      } else {
        parent.scrollLeft = scrollLeft;
        parent.scrollTop = scrollTop;
      }

      // Determine actual scroll amount by reading back scroll properties.
      area = area.translate(clientLeft - parent.scrollLeft,
                            clientTop - parent.scrollTop);
      elem = parent;
  }
};

module.exports = index;
