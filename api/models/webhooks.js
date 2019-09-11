// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const logger = require('../../logger');

const databaseModule = require('../../lib/database-module');
const chargifyModule = require('../../lib/chargify-module');
const firstPromoterModule = require('../../lib/fp-module');

class WebhooksModel {
  /**
   * @param {databaseModule} [dbModule]
   * @param {chargifyModule} [chargify]
   * @param {firstPromoterModule} [fpModule]
   */
  constructor(dbModule, chargify, fpModule) {
    this.dbModule = dbModule || databaseModule;
    this.chargify = chargify || chargifyModule;
    this.fpModule = fpModule || firstPromoterModule;
  }

  /**
   * Function to track customer_create webhook from Chargify.
   * Creates promoter account in FirstPromoter.
   * @param {string} eventId unique id of event from Chargify
   * @param {Object} payload request payload
   * @param {express.response} res response object
   */
  customerCreate(eventId, payload, res) {
    // Must return 200 OK as early as possible
    res.status(200).send('Accepted');

    logger.debug('Tracking customer_create event #%s', eventId);

    const customer = payload.customer;

    this.fpModule.promoters
        .create(customer.reference, {
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
        })
        .then(body => {
          logger.debug(
              'Created fp account #%s for customer #%s', body.id, customer.id);
          this.dbModule.update({
            table: 'users',
            fields: {first_promoter_id: body.id},
            where: {id: customer.reference},
          });
        })
        .catch(
            error => logger.error('customer_create webhook error: %O', error));
  }

  /**
   * Function to track signup_success webhook from Chargify.
   * When no coupon were used during subscription creation, does nothing.
   * When coupon was used, find referrer or affiliate to which this coupon
   * refers (for affiliate - current_offer.default_promo_code,
   * for referrer - default_ref_id).
   * When referrer or affiliate was found, creates subcode for promo_code,
   * and tracks signup for affiliate/referrer.
   * @param {string} eventId unique event identifier from chargify
   * @param {Object} payload request payload
   * @param {express.response} res response object
   */
  signUpSuccess(eventId, payload, res) {
    // Must return 200 OK as early as possible
    res.status(200).send('Accepted');

    logger.debug('Tracking signup_success event #%s', eventId);

    const subscription = payload.subscription;
    const customer = payload.subscription.customer;

    let profile = null;

    if (subscription.coupon_code.length == 0) {
      logger.debug(
          'Subscription #%s for customer #%s ' +
              ' has empty coupon code. No FirstPromoter tracking.',
          subscription.id, customer.id);
      return;
    }

    let refId = null;

    this.fpModule.promoters.list()
        .then(body => {
          const refferers = body.filter(
              e => e.default_ref_id.toUpperCase() === subscription.coupon_code);

          profile = body.find(e => e.cust_id == customer.reference);

          if (refferers.length !== 0) {
            refId = refferers[0].default_ref_id;
          } else {
            const affiliates = body.filter(
                e => e.cust_id.length == 0 &&
                    e.promotions[0].current_offer.default_promo_code ==
                        subscription.coupon_code);
            if (affiliates.length !== 0) {
              refId = affiliates[0].default_ref_id;
            }
          }

          if (refId != null) {
            return this.chargify.coupons
                .validate(
                    subscription.product.product_family.id,
                    subscription.coupon_code)
                .then(
                    body => this.chargify.coupons.createSubcode(
                        body.coupon.id, profile.default_ref_id))
                .then(
                    body => logger.debug(
                        'Subcode %s created', body.created_codes[0]))
                .then(
                    _ => this.fpModule.track.signup(
                        customer.email, customer.id, refId));
          }
        })
        .then(result => {
          if (result) {
            logger.debug('Successfully track signup #%s', result.id);
          } else {
            logger.debug(
                'Unable to track coupon_code %s', subscription.coupon_code);
          }
        })
        .catch(
            error => logger.error('signup_success webhook error: %O', error));
  }

  /**
   * Function to listen for renewal_success webhook from chargify.
   * It is needed to track sale in FirstPromoter.
   * @param {string} eventId unique id of event in chargify
   * @param {Object} payload payload of request
   * @param {express.response} res response object
   */
  renewalSuccess(eventId, payload, res) {
    // Must return 200 OK as early as possible
    res.status(200).send('Accepted');

    logger.debug('Tracking renewal_success event #%s', eventId);

    const subscription = payload.subscription;
    const customer = subscription.customer;

    if (subscription.balance_in_cents == 0) {
      logger.debug(
          'Subscription #%s for customer #%s has blank amount. Skipping.',
          subscription.id, customer.id);
      return;
    }

    this.fpModule.track
        .sale(
            customer.email, customer.id, eventId, subscription.balance_in_cents)
        .then(body => {
          if (body) {
            logger.debug(
                'Successfully tracked sale #%s for ' +
                    'customer #%s and subscription #%s',
                body.id, customer.id, subscription.id);
          } else {
            logger.debug(
                'FirstPromoter didn\'t find lead for ' +
                    'customer #%s and subscription #%s',
                customer.id, subscription.id);
          }
        })
        .catch(
            error => logger.error('renewal_success webhook error: %O', error));
  }
}

module.exports = WebhooksModel;
