// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const utils = require('../../lib/utils');
const logger = require('../../logger');

const chargifyModule = require(`../../lib/chargify-module`);
const databaseModule = require('../../lib/database-module');

class ChargifyModel {
  /**
   * @param {chargifyModule} [chargify]
   * @param {databaseModule} [dbModule]
   */
  constructor(chargify, dbModule) {
    this.chargify = chargify || chargifyModule;
    this.dbModule = dbModule || databaseModule;
  }

  /**
   * Function to create a customer profile in Chargify if it does not exist
   * already. Do not need to be used in the sign-up, only in the sign-up from
   * social networks.
   * @param {number} userId id of user
   * @param {express.response} res response object
   */
  createCustomer(userId, res) {
    let user = null;
    this.dbModule
        .queryDb(
            'select chargify_customer_id, phone_number, ' +
                'first_name, last_name, email from users where id = ?',
            [userId])
        .then(result => {
          if (result[0]) {
            user = result[0];
            if (user.chargify_customer_id) {
              utils.fail(res, 400, 'Chargify profile for user already exists');
            } else {
              return this.chargify.customers.create({
                customer: {
                  first_name: user.first_name,
                  last_name: user.last_name,
                  email: user.email,
                  phone: '+' + user.phone_number,
                  reference: userId,
                },
              });
            }
          } else {
            utils.fail(res, 404, 'User not found');
          }
        })
        .then(body => {
          if (body) {
            user.chargify_customer_id = body.customer.id;
            return this.dbModule.queryDb(
                'update users set chargify_customer_id = ? where id = ?',
                [body.customer.id, userId]);
          }
        })
        .then(result => result && utils.success(res, user))
        .catch(error => errorHandler(res, error));
  }

  /**
   * Function to get all products from Chargify.
   * @param {express.response} res response object
   */
  getProducts(res) {
    this.chargify.products.getAll().then(
        body => utils.success(res, from(body, 'product')),
        error => errorHandler(res, error));
  }

  /**
   * Function to get one product from Chargify by its id.
   * @param {number} productId id of product
   * @param {express.response} res response object
   */
  getProduct(productId, res) {
    this.chargify.products.get(productId).then(
        body => utils.success(res, body.product),
        error => errorHandler(res, error));
  }

  /**
   * Function to get all components from Chargify.
   * @param {express.response} res response object
   */
  getComponents(res) {
    this.chargify.components.getAll().then(
        body => utils.success(res, from(body, 'component')),
        error => errorHandler(res, error));
  }

  /**
   * Function to get one component from Chargify by its id.
   * @param {number} componentId id of component
   * @param {express.response} res response object
   */
  getComponent(componentId, res) {
    this.chargify.components.get(componentId)
        .then(
            body => utils.success(res, flatten(body)[0].component),
            error => errorHandler(res, error));
  }

  /**
   * Function to get all subscriptions for user.
   * @param {number} userId id of user
   * @param {express.response} res response object
   */
  getSubscriptions(userId, res) {
    this.checkChargifyCustomerId(userId)
        .then(
            dbCustomerId => this.chargify.customers.subscriptions(dbCustomerId))
        .then(body => utils.success(res, from(body, 'subscription')))
        .catch(error => errorHandler(res, error));
  }

  /**
   * Function to get one subscription for user by its id.
   * @param {number} userId id of user
   * @param {number} subscriptionId id of subscription
   * @param {express.response} res response object
   */
  getSubscription(userId, subscriptionId, res) {
    let customerId = null;
    this.checkChargifyCustomerId(userId)
        .then(dbCustomerId => {
          customerId = dbCustomerId;
          return this.chargify.subscriptions.get(subscriptionId);
        })
        .then(body => {
          if (body.subscription.customer.id === customerId) {
            utils.success(res, body.subscription);
          } else {
            utils.fail(res, 404, 'Subscription not found');
          }
        })
        .catch(error => errorHandler(res, error));
  }

  /**
   * Function to create subscription for user in Chargify.
   * @param {number} userId id of user
   * @param {any} subscriptionData
   * @param {express.response} res response object
   */
  createSubscription(userId, subscriptionData, res) {
    this.checkChargifyCustomerId(userId)
        .then(dbCustomerId => {
          subscriptionData.customer_id = dbCustomerId;

          return this.chargify.subscriptions.create(
              {subscription: subscriptionData});
        })
        .then(body => utils.success(res, body.subscription))
        .catch(error => errorHandler(res, error));
  }

  /**
   * Function to cancel subscription for user (immediately for now).
   * @param {number} userId id of user
   * @param {number} subscriptionId id of subscription
   * @param {Object} reason optional reason of cancellation
   * @param {express.response} res response object
   */
  cancelSubscription(userId, subscriptionId, reason, res) {
    this.chargify.subscriptions
        .cancelImmediately(subscriptionId, {subscription: reason})
        .then(
            body => utils.success(res, body.subscription),
            error => errorHandler(res, error));
  }

  /**
   * Function to record component usage for subscription.
   * @param {number} userId id of user
   * @param {number} subscriptionId id of subscription
   * @param {{quantity: number, memo: string}} usageData usage details
   * @param {express.response} res response object
   */
  subscriptionUsage(userId, subscriptionId, usageData, res) {
    let customerId = null;
    let componentId = null;
    this.checkChargifyCustomerId(userId)
        .then(dbCustomerId => {
          customerId = dbCustomerId;
          return this.chargify.subscriptions.get(subscriptionId);
        })
        .then(body => {
          if (body.subscription.customer.id === customerId) {
            return this.chargify.subscriptions.getComponents(subscriptionId);
          } else {
            utils.fail(res, 404, 'Subscription not found');
          }
        })
        .then(body => {
          if (body) {
            if (body.length != 0) {
              componentId = body[0].component.component_id;
              return this.chargify.subscriptions.usage(
                  subscriptionId, componentId, {usage: usageData});
            } else {
              utils.fail(res, 404, 'Components for subscription not found');
            }
          }
        })
        .then(body => {
          if (body) {
            utils.success(res, body);
          }
        })
        .catch(error => errorHandler(res, error));
  }

  /**
   * Function to get all payment profiles of user.
   * @param {number} userId id of user
   * @param {express.response} res response object
   */
  getPaymentProfiles(userId, res) {
    let customerId = null;
    this.checkChargifyCustomerId(userId)
        .then(dbCustomerId => {
          customerId = dbCustomerId;
          return this.chargify.paymentProfiles.getAll();
        })
        .then(body => {
          const paymentProfiles = from(body, 'payment_profile');

          utils.success(
              res, paymentProfiles.filter(e => e.customer_id == customerId));
        })
        .catch(error => errorHandler(res, error));
  }

  /**
   * Function to get particular payment profile for user.
   * @param {number} userId id of user
   * @param {number} paymentProfileId id of payment profile
   * @param {express.response} res response object
   */
  getPaymentProfile(userId, paymentProfileId, res) {
    let customerId = null;
    this.checkChargifyCustomerId(userId)
        .then(dbCustomerId => {
          customerId = dbCustomerId;
          return this.chargify.paymentProfiles.get(paymentProfileId);
        })
        .then(body => {
          if (body.payment_profile.customer_id === customerId) {
            utils.success(res, body.payment_profile);
          } else {
            utils.fail(res, 404, 'Payment profile not found');
          }
        })
        .catch(error => errorHandler(res, error));
  }

  setDefaultPaymentProfile(userId, paymentProfileId, res) {
    let customerId = null;
    this.checkChargifyCustomerId(userId)
        .then(dbCustomerId => {
          customerId = dbCustomerId;
          return this.chargify.paymentProfiles.get(paymentProfileId);
        })
        .then(body => {
          if (body.payment_profile.customer_id === customerId) {
            return this.dbModule.queryDb(
                'update users set default_payment_profile_id = ? where id = ?',
                [paymentProfileId, userId]);
          } else {
            utils.fail(res, 404, 'Payment profile not found');
          }
        })
        .then(result => {
          if (result) {
            utils.success(res, {
              status: 200,
              message: 'Successfully set default payment profile',
            });
          }
        })
        .catch(error => errorHandler(res, error));
  }

  /**
   * Function to create payment profile in chargify for particular user.
   * @param {number} userId id of user to create payment profile to
   * @param {Object} paymentProfileData payment credit card data
   * @param {express.response} res response object
   */
  createPaymentProfile(userId, paymentProfileData, res) {
    let paymentProfile = null;
    this.checkChargifyCustomerId(userId)
        .then(dbCustomerId => {
          paymentProfileData.payment_type = 'credit_card';
          paymentProfileData.customer_id = dbCustomerId;

          return this.chargify.paymentProfiles.create(
              {payment_profile: paymentProfileData});
        })
        .then(body => {
          paymentProfile = body.payment_profile;
          return;
        })
        .then(
            _ => this.dbModule.queryDb(
                'update users set default_payment_profile_id = ? where id = ?',
                [paymentProfile.id, userId]))
        .then(result => result && utils.success(res, paymentProfile))
        .catch(error => errorHandler(res, error));
  }

  /**
   * Get management portal link info
   * @param {number} userId id of user
   * @param {express.response} res response object
   */
  getBillingPortal(userId, res) {
    this.checkChargifyCustomerId(userId)
        .then(this.chargify.portal.get)
        .then(body => utils.success(res, body))
        .catch(error => errorHandler(res, error));
  }

  /**
   * Enable billing portal for user
   * @param {number} userId id of user
   * @param {express.response} res response object
   */
  enableBillingPortal(userId, res) {
    this.checkChargifyCustomerId(userId)
        .then(this.chargify.portal.enable)
        .then(body => utils.success(res, body))
        .catch(error => errorHandler(res, error));
  }

  /**
   * Disable billing portal for user
   * @param {number} userId id of user
   * @param {express.response} res response object
   */
  disableBillingPortal(userId, res) {
    this.checkChargifyCustomerId(userId)
        .then(this.chargify.portal.revoke)
        .then(body => utils.success(res, body))
        .catch(error => errorHandler(res, error));
  }

  /**
   * Function that resolves with chargify id from database
   * or rejects if user id not found.
   * @private
   * @param {number} userId user_id from request
   * @return {Promise}
   */
  checkChargifyCustomerId(userId) {
    return this.dbModule
        .queryDb(
            'select chargify_customer_id from users where id = ?', [userId])
        .then(result => {
          if (result[0]) {
            if (result[0].chargify_customer_id) {
              return Promise.resolve(result[0].chargify_customer_id);
            } else {
              return Promise.reject(
                  constructError(404, 'Chargify customer not created'));
            }
          } else {
            return Promise.reject(constructError(404, 'User not found'));
          }
        });
  }
}

/**
 * Function, that constructs error object and fills it
 * with status code and errorMessage.
 * @private
 * @param {number} statusCode http status for error
 * @param {string} message message for response
 * @return {any}
 */
function constructError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorMessage = message;
  return error;
}

/**
 * Function to handle errors.
 * @private
 * @param {Object} res Express response object
 * @param {any} error Error object
 * @return {void}
 */
function errorHandler(res, error) {
  const errors = error.error ? error.error.errors || [] : [];
  if (errors.length > 0) {
    return utils.fail(res, error.statusCode, errors.join('\n'));
  } else if (error.statusCode === 422) {
    const message = Object.entries(errors)
        .map(([key, value]) => `${key}: ${value}`)
        .join('/n');
    return utils.fail(res, error.statusCode, message);
  } else if (error.statusCode === 404) {
    return utils.fail(res, error.statusCode, error.errorMessage || 'Not found');
  } else if (error.statusCode === 500) {
    return utils.fail(res, error.statusCode, 'Chargify error');
  } else {
    logger.error('Unknown error: %O', error);
    return utils.fail(res, 500, 'Unknown error');
  }
}

/**
 * Function for array flattening.
 * @private
 * @param {any[]} list list to flatten
 * @return {any[]}
 */
function flatten(list) {
  return list.reduce(reducer, []);
}

/**
 * Reducer function for flatten function.
 * @private
 * @param {any[]} acc accumulator
 * @param {any} cur current value
 * @return {any[]}
 */
function reducer(acc, cur) {
  return acc.concat(Array.isArray(cur) ? flatten(cur) : cur);
}

/**
 * Utility function to convert chargify results to our API-like.
 * @param {any[]} array
 * @param {string} objKey
 * @return {any[]}
 */
function from(array, objKey) {
  return Array.from(flatten(array), e => e[objKey]);
}

module.exports = ChargifyModel;
