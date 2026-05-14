const express = require("express");
const router = express.Router();
const collectionController = require("../controllers/collectionController");

router.get("/", collectionController.getCollections);
router.get("/:id/products", collectionController.getCollectionProducts);

module.exports = router;
