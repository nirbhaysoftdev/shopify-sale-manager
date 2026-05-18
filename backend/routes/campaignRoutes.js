const express = require("express");
const router = express.Router();
const { createCampaign, getCampaigns, endCampaignNow, getConflicts } = require("../controllers/campaignController");

router.post("/", createCampaign);
router.get("/", getCampaigns);
router.get("/conflicts", getConflicts);
router.post("/:id/end", endCampaignNow);

module.exports = router;