from scoring_engine import score_customer

fake = {
    "delivery_period": "Oct-Nov",
    "dispatch_days": "15",
    "demo_days": "20",
    "high_low_holder": "H",
    "current_business": "YES",
    "nature_sabhasad": "AWARE",
    "support": "HIGH"
}

print(score_customer(fake))