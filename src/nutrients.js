// The nutrients the app tracks: the meal analysis, the daily targets and the screens all use
// this one list, so adding a nutrient here is enough for it to show up everywhere.
// group: 'main' shows on the Today screen straight away; the rest sit under "Vitamin & khoáng chất".
// limit: true marks nutrients where going OVER the daily maximum is the concern (sodium, sugar...).
export const NUTRIENTS = [
  { key: 'energy_kcal', name: 'Năng lượng', unit: 'kcal', group: 'main' },
  { key: 'protein_g', name: 'Đạm (protein)', unit: 'g', group: 'main' },
  { key: 'carbs_g', name: 'Tinh bột (carb)', unit: 'g', group: 'main' },
  { key: 'sugar_g', name: 'Đường', unit: 'g', group: 'main', limit: true },
  { key: 'fiber_g', name: 'Chất xơ', unit: 'g', group: 'main' },
  { key: 'fat_g', name: 'Chất béo', unit: 'g', group: 'main' },
  { key: 'sat_fat_g', name: 'Chất béo bão hòa', unit: 'g', group: 'main', limit: true },
  { key: 'cholesterol_mg', name: 'Cholesterol', unit: 'mg', group: 'main', limit: true },
  { key: 'sodium_mg', name: 'Natri (muối)', unit: 'mg', group: 'main', limit: true },
  { key: 'purine_mg', name: 'Purin (axit uric)', unit: 'mg', group: 'main', limit: true },
  { key: 'potassium_mg', name: 'Kali', unit: 'mg', group: 'micro' },
  { key: 'calcium_mg', name: 'Canxi', unit: 'mg', group: 'micro' },
  { key: 'iron_mg', name: 'Sắt', unit: 'mg', group: 'micro' },
  { key: 'magnesium_mg', name: 'Magie', unit: 'mg', group: 'micro' },
  { key: 'zinc_mg', name: 'Kẽm', unit: 'mg', group: 'micro' },
  { key: 'phosphorus_mg', name: 'Phốt pho', unit: 'mg', group: 'micro' },
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
