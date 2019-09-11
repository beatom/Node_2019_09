// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

class QuestionController {
  constructor(model) {
    this.questionModel = model;
  }

  /**
   * Handles getting all questions from database.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getAll(req, res) {
    const token = req.params.token;

    if (!token) {
      res.status(400).json({message: 'Token is missing'});
      return;
    }

    this.questionModel.getAll(token, res);
  }

  /**
   * Setup routes for question controller
   * @param {express.application} app application to setup
   */
  setupRoutes(app) {
    // get all questions from database
    app.get('/api/:token/questions', this.getAll.bind(this));
  }
}

module.exports = QuestionController;
