// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const utils = require('../../lib/utils');

class ChargifyController {
  // this class depends on chargify model
  constructor(model) {
    this.chargifyModel = model;
  }

  /**
   * Handles creating customer for user profile.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  createCustomer(req, res) {
    this.chargifyModel.createCustomer(req.params.userId, res);
  }

  /**
   * Handles getting all products from Chargify.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getProducts(req, res) {
    this.chargifyModel.getProducts(res);
  }

  /**
   * Handles get one product from Chargify.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getProduct(req, res) {
    this.chargifyModel.getProduct(req.params.productId, res);
  }

  /**
   * Handles getting all components from Chargify.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getComponents(req, res) {
    this.chargifyModel.getComponents(res);
  }

  /**
   * Handles get one component from Chargify.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getComponent(req, res) {
    this.chargifyModel.getComponent(req.params.componentId, res);
  }

  /**
   * Handles getting all subscriptions for user.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getSubscriptions(req, res) {
    this.chargifyModel.getSubscriptions(req.params.userId, res);
  }

  /**
   * Handles getting one subscription for user.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getSubscription(req, res) {
    this.chargifyModel.getSubscription(
        req.params.userId, req.params.subscriptionId, res);
  }

  /**
   * Handles creating of subscription for user.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  createSubscription(req, res) {
    const errors = utils.checkRequired(req.body, [
      'product_id',
      'payment_profile_id',
    ]);

    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'), {clientShowMessage: true});
      return;
    }

    this.chargifyModel.createSubscription(req.params.userId, req.body, res);
  }

  /**
   * Handles subscription cancellation for user.
   * Only immediate cancellation is supported for now.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  cancelSubscription(req, res) {
    this.chargifyModel.cancelSubscription(
        req.params.userId, req.params.subscriptionId, req.body || {}, res);
  }

  /**
   * Handles recording of component usage for subscription.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  subscriptionUsage(req, res) {
    if (!req.body.quantity) {
      errorResponse(res, 'Quantity is required');
      return;
    }

    if (req.body.quantity <= 0) {
      errorResponse(
          res, 'Quantity must be greater than 0');
      return;
    }

    this.chargifyModel.subscriptionUsage(
        req.params.userId, req.params.subscriptionId, req.body, res);
  }

  /**
   * Handles getting all payment profiles for user.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getPaymentProfiles(req, res) {
    this.chargifyModel.getPaymentProfiles(req.params.userId, res);
  }

  /**
   * Handles getting one payment profile for user.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getPaymentProfile(req, res) {
    this.chargifyModel.getPaymentProfile(
        req.params.userId, req.params.paymentProfileId, res);
  }

  /**
   * Sets default payment profile for user.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  setDefaultPaymentProfile(req, res) {
    this.chargifyModel.setDefaultPaymentProfile(
        req.params.userId, req.params.paymentProfileId, res);
  }

  /**
   * Handles creating of payment profiles for user.
   * Credit card data in incoming request must not be saved
   * to database, and must be passed to Chargify without changes.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  createPaymentProfile(req, res) {
    const errors = utils.checkRequired(req.body, [
      'full_number',
      'expiration_month',
      'expiration_year',
      'cvv',
    ]);

    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'), {clientShowMessage: true});
      return;
    }

    this.chargifyModel.createPaymentProfile(req.params.userId, req.body, res);
  }

  /**
   * Get management link info for user
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getBillingPortal(req, res) {
    this.chargifyModel.getBillingPortal(req.params.userId, res);
  }

  /**
   * Enable billing portal for user
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  enableBillingPortal(req, res) {
    this.chargifyModel.enableBillingPortal(req.params.userId, res);
  }

  /**
   * Disable billing portal for user
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  disableBillingPortal(req, res) {
    this.chargifyModel.disableBillingPortal(req.params.userId, res);
  }

  /**
   * Setup routes for chargify controller
   * @param {express.application} app application to setup
   */
  setupRoutes(app) {
    // gets products from chargify
    app.get('/api/:token/products', this.getProducts.bind(this));
    app.get('/api/:token/products/:productId', this.getProduct.bind(this));

    // gets components from chargify
    app.get('/api/:token/components', this.getComponents.bind(this));
    app.get(
        '/api/:token/components/:componentId', this.getComponent.bind(this));

    // manage subscriptions for user
    app.route('/api/:token/user/:userId/subscriptions')
        .get(this.getSubscriptions.bind(this))
        .post(this.createSubscription.bind(this));

    // additional route to create customer profile in chargify separately
    app.route('/api/:token/user/:userId/customer_create')
        .get(this.createCustomer.bind(this));

    app.route('/api/:token/user/:userId/subscriptions/:subscriptionId')
        .get(this.getSubscription.bind(this))
        .delete(this.cancelSubscription.bind(this));

    // additional route to track subscription usage
    app.route('/api/:token/user/:userId/subscriptions/:subscriptionId/usage')
        .post(this.subscriptionUsage.bind(this));

    // manage payment profiles for user
    app.route('/api/:token/user/:userId/payment_profiles')
        .get(this.getPaymentProfiles.bind(this))
        .post(this.createPaymentProfile.bind(this));

    app.route('/api/:token/user/:userId/payment_profiles/:paymentProfileId')
        .get(this.getPaymentProfile.bind(this));

    app.route(
        '/api/:token/user/:userId/payment_profiles' +
           '/:paymentProfileId/set_default')
        .get(this.setDefaultPaymentProfile.bind(this));

    // billing portal route
    app.route('/api/:token/user/:userId/billing_portal')
        .get(this.getBillingPortal.bind(this))
        .post(this.enableBillingPortal.bind(this))
        .delete(this.disableBillingPortal.bind(this));
  }
}

/**
 * Small wrapper to return failed response
 * @private
 * @param {Object} res Express response object
 * @param {string} message message to display
 * @param {Object} [otherParams] optional parameters to pass
 * @return {void}
 */
function errorResponse(res, message, otherParams) {
  return utils.fail(res, 400, message, otherParams);
}

module.exports = ChargifyController;
