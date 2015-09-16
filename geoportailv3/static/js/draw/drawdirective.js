/**
 * @fileoverview This file provides a draw directive. This directive is used
 * to create a draw panel in the page.
 *
 * Example:
 *
 * <app-draw app-draw-map="::mainCtrl.map"
 *           app-draw-active="mainCtrl.drawOpen"
 *           app-draw-features="mainCtrl.drawnFeatures"></app-draw>
 *
 * Note the use of the one-time binding operator (::) in the map expression.
 * One-time binding is used because we know the map is not going to change
 * during the lifetime of the application.
 */
goog.provide('app.DrawController');
goog.provide('app.drawDirective');

goog.require('app');
goog.require('goog.asserts');
goog.require('ngeo.DecorateInteraction');
goog.require('ngeo.Location');
goog.require('ngeo.format.FeatureHash');
goog.require('ol.CollectionEventType');
goog.require('ol.events.condition');
goog.require('ol.geom.GeometryType');
goog.require('ol.interaction.Draw');


/**
 * @param {string} appDrawTemplateUrl Url to draw template
 * @return {angular.Directive} The Directive Definition Object.
 * @ngInject
 */
app.drawDirective = function(appDrawTemplateUrl) {
  return {
    restrict: 'E',
    scope: {
      'map': '=appDrawMap',
      'features': '=appDrawFeatures',
      'active': '=appDrawActive',
      'selectInteraction': '=appDrawSelectinteraction'
    },
    controller: 'AppDrawController',
    controllerAs: 'ctrl',
    bindToController: true,
    templateUrl: appDrawTemplateUrl
  };
};


app.module.directive('appDraw', app.drawDirective);



/**
 * @param {!angular.Scope} $scope Scope.
 * @param {ngeo.DecorateInteraction} ngeoDecorateInteraction Decorate
 *     interaction service.
 * @param {ngeo.Location} ngeoLocation Location service.
 * @param {app.FeaturePopup} appFeaturePopup Feature popup service.
 * @constructor
 * @export
 * @ngInject
 */
app.DrawController = function($scope, ngeoDecorateInteraction, ngeoLocation,
    appFeaturePopup) {

  /**
   * @type {ol.Map}
   *  @export
   */
  this.map;

  /**
   * @type {boolean}
   *  @export
   */
  this.active;

  /**
   * @type {number}
   * @private
   */
  this.featureSeq_ = 0;

  /**
   * @type {ol.Collection.<ol.Feature>}
   * @export
   */
  this.features;

  /**
   * @type {ol.interaction.Select}
   *  @export
   */
  this.selectInteraction;

  /**
   * @type {app.FeaturePopup}
   * @private
   */
  this.featurePopup_ = appFeaturePopup;

  /**
   * @type {angular.Scope}
   * @private
   */
  this.scope_ = $scope;

  /**
   * @type {ngeo.Location}
   * @private
   */
  this.ngeoLocation_ = ngeoLocation;

  /**
   * @type {ngeo.format.FeatureHash}
   * @private
   */
  this.fhFormat_ = new ngeo.format.FeatureHash();

  var drawPoint = new ol.interaction.Draw({
    features: this.features,
    type: ol.geom.GeometryType.POINT
  });

  /**
   * @type {ol.interaction.Draw}
   * @export
   */
  this.drawPoint = drawPoint;

  drawPoint.setActive(false);
  ngeoDecorateInteraction(drawPoint);
  this.map.addInteraction(drawPoint);
  goog.events.listen(drawPoint, ol.interaction.DrawEventType.DRAWEND,
      this.onDrawEnd_, false, this);

  var drawLine = new ol.interaction.Draw({
    features: this.features,
    type: ol.geom.GeometryType.LINE_STRING
  });

  /**
   * @type {ol.interaction.Draw}
   * @export
   */
  this.drawLine = drawLine;

  drawLine.setActive(false);
  ngeoDecorateInteraction(drawLine);
  this.map.addInteraction(drawLine);
  goog.events.listen(drawLine, ol.interaction.DrawEventType.DRAWEND,
      this.onDrawEnd_, false, this);

  // Watch the "active" property, and disable the draw interactions
  // when "active" gets set to false.
  $scope.$watch(goog.bind(function() {
    return this.active;
  }, this), goog.bind(function(newVal) {
    if (newVal === false) {
      this.drawPoint.setActive(false);
      this.drawLine.setActive(false);
    }
  }, this));

  // Decode the features encoded in the URL and add them to the collection
  // of drawn features.
  var encodedFeatures = ngeoLocation.getParam('features');
  if (goog.isDef(encodedFeatures)) {
    var features = this.fhFormat_.readFeatures(encodedFeatures);
    goog.asserts.assert(!goog.isNull(features));
    this.features.extend(features);
  }

  goog.events.listen(this.selectInteraction,
      ol.interaction.SelectEventType.SELECT,
      /**
       * @param {ol.interaction.SelectEvent} evt
       */
      function(evt) {
        if (evt.selected.length > 0) {
          this.featurePopup_.show(evt.selected[0],
              evt.mapBrowserEvent.coordinate);
        } else {
          this.featurePopup_.hide();
        }
        $scope.$apply();
      }, true, this);
};


/**
 * @param {ol.interaction.DrawEvent} event
 * @private
 */
app.DrawController.prototype.onDrawEnd_ = function(event) {
  var feature = event.feature;
  feature.set('name', 'element ' + (++this.featureSeq_));

  // Deactivating asynchronosly to prevent dbl-click to zoom in
  window.setTimeout(goog.bind(function() {
    this.scope_.$apply(function() {
      event.target.setActive(false);
    });
  }, this), 0);

  // Encode the features in the URL.
  // warning: the drawn feature is not yet in the collection when the
  // "drawend" event is triggered. So we create a new array and append
  // the drawn feature to that array.
  var features = this.features.getArray().slice();
  features.push(feature);
  this.ngeoLocation_.updateParams({
    'features': this.fhFormat_.writeFeatures(features)
  });
};

app.module.controller('AppDrawController', app.DrawController);
