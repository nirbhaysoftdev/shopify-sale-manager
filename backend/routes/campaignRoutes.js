const express = require("express");
const router = express.Router();
const { createCampaign, getCampaigns, endCampaignNow } = require("../controllers/campaignController");

router.post("/", createCampaign);
router.get("/", getCampaigns);
router.post("/:id/end", endCampaignNow);

module.exports = router;