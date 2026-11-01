// The nutrients the app tracks: the meal analysis, the daily targets and the screens all use
// this one list, so adding a nutrient here is enough for it to show up everywhere.
// group: 'main' shows on the Today screen straight away; the rest sit under "Vitamins & minerals".
// limit: true marks nutrients where going OVER the daily maximum is the concern (sodium, free sugars...).
// Sugar is split by source (WHO): free sugars (added, honey, juice) are the ones to limit; sugars inside
// whole fruit and vegetables, and milk sugar, are not, apart from generous caps for some conditions.
// Total sugar is their sum, kept for information. The names say where each one comes from.
// Purines are split the same way: those from meat, seafood and beer raise gout risk; those from plant
// foods (beans, tofu, vegetables), dairy and eggs don't (Choi et al., NEJM 2004). Total purines is the sum.
export const NUTRIENTS = [
  { key: 'energy_kcal', name: 'Energy', unit: 'kcal', group: 'main' },
  { key: 'protein_g', name: 'Protein', unit: 'g', group: 'main' },
  { key: 'carbs_g', name: 'Carbohydrate', unit: 'g', group: 'main' },
  { key: 'sugar_g', name: 'Total sugar', unit: 'g', group: 'main' },
  { key: 'free_sugar_g', name: 'Sugars – added, honey, juice', unit: 'g', group: 'main', limit: true },
  { key: 'fruit_sugar_g', name: 'Sugars – whole fruit & veg', unit: 'g', group: 'main' },
  { key: 'milk_sugar_g', name: 'Sugars – milk', unit: 'g', group: 'main' },
  { key: 'fiber_g', name: 'Fiber', unit: 'g', group: 'main' },
  { key: 'fat_g', name: 'Fat', unit: 'g', group: 'main' },
  { key: 'sat_fat_g', name: 'Saturated fat', unit: 'g', group: 'main', limit: true },
  { key: 'cholesterol_mg', name: 'Cholesterol', unit: 'mg', group: 'main', limit: true },
  { key: 'sodium_mg', name: 'Sodium (salt)', unit: 'mg', group: 'main', limit: true },
  { key: 'purine_mg', name: 'Total purines', unit: 'mg', group: 'main' },
  { key: 'purine_animal_mg', name: 'Purines – meat, seafood, beer', unit: 'mg', group: 'main', limit: true },
  { key: 'purine_plant_mg', name: 'Purines – plants, dairy, eggs', unit: 'mg', group: 'main' },
  { key: 'potassium_mg', name: 'Potassium', unit: 'mg', group: 'micro' },
  { key: 'calcium_mg', name: 'Calcium', unit: 'mg', group: 'micro' },
  { key: 'iron_mg', name: 'Iron', unit: 'mg', group: 'micro' },
  { key: 'magnesium_mg', name: 'Magnesium', unit: 'mg', group: 'micro' },
  { key: 'zinc_mg', name: 'Zinc', unit: 'mg', group: 'micro' },
  { key: 'phosphorus_mg', name: 'Phosphorus', unit: 'mg', group: 'micro' },
  { key: 'vitamin_a_ug', name: 'Vitamin A', unit: 'µg', group: 'micro' },
  { key: 'vitamin_c_mg', name: 'Vitamin C', unit: 'mg', group: 'micro' },
  { key: 'vitamin_d_ug', name: 'Vitamin D', unit: 'µg', group: 'micro' },
  { key: 'vitamin_e_mg', name: 'Vitamin E', unit: 'mg', group: 'micro' },
  { key: 'vitamin_k_ug', name: 'Vitamin K', unit: 'µg', group: 'micro' },
  { key: 'vitamin_b1_mg', name: 'Vitamin B1', unit: 'mg', group: 'micro' },
  { key: 'vitamin_b2_mg', name: 'Vitamin B2', unit: 'mg', group: 'micro' },
  { key: 'vitamin_b3_mg', name: 'Vitamin B3', unit: 'mg', group: 'micro' },
  { key: 'vitamin_b6_mg', name: 'Vitamin B6', unit: 'mg', group: 'micro' },
  { key: 'vitamin_b12_ug', name: 'Vitamin B12', unit: 'µg', group: 'micro' },
  { key: 'folate_ug', name: 'Folate (B9)', unit: 'µg', group: 'micro' }
];
