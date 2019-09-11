// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

class PharmaciesController {
  // this class depends on pharmacies model
  constructor(model) {
    this.pharmaciesModel = model;
  }

  /**
   * Handles getting all pharmacies API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getAll(req, res) {
    const searchQuery = req.query.search;

    // convert string query to numbers
    req.query.page = ~~req.query.page;
    req.query.per_page = ~~req.query.per_page;

    const page = req.query.page <= 0 ? 1 : req.query.page;
    const perPage = req.query.per_page <= 10 ? 10 : req.query.per_page;

    if (searchQuery) {
      this.pharmaciesModel.searchPharmacies(searchQuery, page, perPage, res);
    } else {
      this.pharmaciesModel.getAll(page, perPage, res);
    }
  }

  /**
   * Handles get one pharmacy API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  get(req, res) {
    this.pharmaciesModel.get(req.params.pharmacyId, res);
  }

  /**
   * Setup routes for pharmacies controller
   * @param {express.application} app application to setup
   */
  setupRoutes(app) {
    app.route('/api/:token/pharmacies').get(this.getAll.bind(this));
    app.route('/api/:token/pharmacies/:pharmacyId').get(this.get.bind(this));
  }
}

module.exports = PharmaciesController;
