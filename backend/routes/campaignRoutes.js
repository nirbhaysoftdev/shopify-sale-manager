const express = require("express");
const router = express.Router();
const { createCampaign, getCampaigns, endCampaignNow, getConflicts, getCampaignDetail } = require("../controllers/campaignController");

router.post("/", createCampaign);
router.get("/", getCampaigns);
router.get("/conflicts", getConflicts);
router.get("/:id", getCampaignDetail);
router.post("/:id/end", endCampaignNow);

module.exports = router;