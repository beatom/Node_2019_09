// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

class DrugsController {
  // this class depends on drugs model
  constructor(model) {
    this.drugsModel = model;
  }

  /**
   * Handles get all drugs API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getDrugs(req, res) {
    const searchQuery = req.query.search;

    req.query.page = ~~req.query.page;
    req.query.per_page = ~~req.query.per_page;

    const page = req.query.page <= 0 ? 1 : req.query.page;
    const perPage = req.query.per_page < 10 ? 10 : req.query.per_page;

    if (searchQuery) {
      this.drugsModel.searchDrugs(searchQuery, page, perPage, res);
    } else {
      this.drugsModel.getAll(page, perPage, res);
    }
  }

  /**
   * Handles get one drug API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  get(req, res) {
    this.drugsModel.get(req.params.drugId, res);
  }

  /**
   * Handles get prices for drug.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getPrices(req, res) {
    const pharmacyId = req.query.pharmacy_id || null;
    this.drugsModel.getPrices(req.params.drugId, pharmacyId, res);
  }

  /**
   * Handles getting lowest price for drug.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getLowestPrices(req, res) {
    this.drugsModel.getLowestPrices(req.params.drugId, res);
  }

  /**
   * Setup routes for drugs controller
   * @param {express.application} app application to setup
   */
  setupRoutes(app) {
    app.route('/api/:token/drugs').get(this.getDrugs.bind(this));
    app.route('/api/:token/drugs/:drugId').get(this.get.bind(this));
    app.route('/api/:token/drugs/:drugId/prices')
        .get(this.getPrices.bind(this));

    // get lowest price route
    app.route('/api/:token/drugs/:drugId/prices/lowest')
        .get(this.getLowestPrices.bind(this));
  }
}

module.exports = DrugsController;
