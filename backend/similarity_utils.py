import re
from difflib import SequenceMatcher
from typing import Dict, Any

def normalize_distributor_name(name: str) -> str:
    """
    Phase 4: Normalize mantri_name by uppercasing, trimming spaces,
    removing special characters, and dropping common suffixes.
    """
    if not name:
        return ""
    
    # Uppercase
    n = str(name).upper().strip()
    
    # Remove special characters (keep alphanumeric and spaces)
    n = re.sub(r'[^A-Z0-9\s]', '', n)
    
    # Remove common suffixes using word boundaries
    suffixes = [r'\bMANTRY\b', r'\bMANTRI\b', r'\bMR\b', r'\bSHRI\b']
    for suffix in suffixes:
        n = re.sub(suffix, '', n)
        
    # Trim extra spaces caused by suffix removal
    n = re.sub(r'\s+', ' ', n).strip()
    
    return n

def calculate_similarity(distributor_a: dict, distributor_b: dict) -> Dict[str, Any]:
    """
    Phase 4 Foundation: Calculates similarity between two distributors.
    Returns confidence score and whether it's a probable match.
    Note: This is strictly for detection/review, not auto-merging.
    """
    name_a = normalize_distributor_name(distributor_a.get("mantri_name", ""))
    name_b = normalize_distributor_name(distributor_b.get("mantri_name", ""))
    
    # Calculate similarity ratio
    score = SequenceMatcher(None, name_a, name_b).ratio()
    
    # Threshold logic
    # > 0.90 = high confidence
    # 0.75-0.90 = possible conflict
    # < 0.75 = unrelated
    probable_match = score >= 0.75
    
    if probable_match:
        print("\n🔍 [P4 SIMILARITY]")
        print(f"Comparing:")
        print(f"A: '{distributor_a.get('mantri_name', '')}' -> '{name_a}'")
        print(f"B: '{distributor_b.get('mantri_name', '')}' -> '{name_b}'")
        print(f"Score: {score:.2f} | Probable Match: {probable_match}\n")
    
    return {
        "similarity_score": round(score, 2),
        "probable_match": probable_match,
        "name_a_normalized": name_a,
        "name_b_normalized": name_b
    }

if __name__ == "__main__":
    d1 = {"mantri_name": "ARJUNBHAI - MANTRY"}
    d2 = {"mantri_name": "ARJUNBHAI SOLANKI"}
    calculate_similarity(d1, d2)
