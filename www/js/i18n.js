// Language of the app: English (as written in app.js) or Vietnamese.
// The app is written in English; when Vietnamese is chosen, every text that reaches the page (text,
// placeholder, aria-label, title, alt, alert/confirm messages) is looked up here: first as a whole
// string, then against patterns for texts with numbers or names in them. Anything not found stays
// English. The choice is a per-device display preference kept in localStorage.
(function () {
  var lang = 'en';
  try {
    lang = localStorage.getItem('lang') === 'vi' ? 'vi' : 'en';
  } catch (e) {
    // Storage blocked: English.
  }

  var VI = {
    // ---- Tabs, titles, common words ----
    'My Nutrition': 'Dinh Dưỡng Của Tôi',
    'Today': 'Hôm nay',
    'Food': 'Bữa ăn',
    'Workout': 'Tập luyện',
    'History': 'Lịch sử',
    'Profile': 'Hồ sơ',
    'Settings': 'Cài đặt',
    'Back': 'Quay lại',
    'Main screens': 'Màn hình chính',
    'Working...': 'Đang xử lý...',
    'Add': 'Thêm',
    'Cancel': 'Hủy',
    'Done': 'Xong',
    'Delete': 'Xóa',
    'Undo': 'Hoàn tác',
    'All': 'Hết',
    'Logo': 'Logo',
    'Meal': 'Bữa ăn',
    'Meal photo': 'Ảnh bữa ăn',
    'Exercise': 'Bài tập',
    'Notes': 'Ghi chú',
    'Time': 'Giờ',
    'Total': 'Tổng',
    'Need': 'Cần',
    'Avg/day': 'TB/ngày',
    'Nutrient': 'Chất',
    'Nutrition': 'Dinh dưỡng',
    'Summary': 'Tổng kết',
    'From': 'Từ',
    'To': 'Đến',
    'Type': 'Loại',
    'Unit': 'Đơn vị',
    'Result': 'Kết quả',
    'Blood': 'Máu',
    'Urine': 'Nước tiểu',
    'Other': 'Khác',
    'Light': 'Sáng',
    'Dark': 'Tối',
    'Light.': 'Nhẹ nhàng.',
    'Drop to delete': 'Thả vào để xóa',
    'Get started': 'Bắt đầu',
    'Error:': 'Lỗi:',
    'low': 'thấp',
    'medium': 'vừa',
    'high': 'cao',
    'normal': 'bình thường',
    'unclear': 'chưa rõ',

    // ---- Nutrients ----
    'Energy': 'Năng lượng',
    'Protein': 'Đạm',
    'Carbohydrate': 'Tinh bột',
    'Total sugar': 'Tổng đường',
    'Sugars – added, honey, juice': 'Đường – thêm vào, mật ong, nước ép',
    'Sugars – whole fruit & veg': 'Đường – trái cây & rau nguyên',
    'Sugars – milk': 'Đường – sữa',
    'Fiber': 'Chất xơ',
    'Fat': 'Chất béo',
    'Saturated fat': 'Chất béo bão hòa',
    'Cholesterol': 'Cholesterol',
    'Sodium (salt)': 'Natri (muối)',
    'Sodium': 'Natri',
    'Total purines': 'Tổng purin',
    'Purines – meat, seafood, beer': 'Purin – thịt, hải sản, bia',
    'Purines – plants, dairy, eggs': 'Purin – thực vật, sữa, trứng',
    'Potassium': 'Kali',
    'Calcium': 'Canxi',
    'Iron': 'Sắt',
    'Magnesium': 'Magie',
    'Zinc': 'Kẽm',
    'Phosphorus': 'Phốt pho',
    'Vitamin A': 'Vitamin A',
    'Folate (B9)': 'Folate (B9)',
    'Folate': 'Folate',
    'Added sugar': 'Đường thêm',
    'Meat purines': 'Purin từ thịt',
    'Macronutrients': 'Chất đa lượng',
    'Main nutrients': 'Chất chính',
    'Vitamins': 'Vitamin',
    'Minerals': 'Khoáng chất',
    'Vitamins & minerals': 'Vitamin & khoáng chất',
    'Share of energy': 'Tỉ lệ năng lượng',
    'Advised': 'Khuyên dùng',
    'For information (no limit in normal amounts)': 'Để tham khảo (không giới hạn ở lượng bình thường)',
    'No daily target': 'Chưa có mục tiêu ngày',
    'No daily targets yet — work them out in Profile to see these against your needs': 'Chưa có mục tiêu ngày — hãy tính ở Hồ sơ để so với nhu cầu của bạn',
    'Met': 'Đạt',
    'Within limit': 'Trong giới hạn',
    '✅ Met': '✅ Đạt',
    'Macronutrients, each as a % of its daily target': 'Chất đa lượng, mỗi chất theo % mục tiêu ngày',
    'Main nutrients, each as a % of its daily target': 'Chất chính, mỗi chất theo % mục tiêu ngày',
    'Vitamins, each as a % of its daily target': 'Vitamin, mỗi chất theo % mục tiêu ngày',
    'Minerals, each as a % of its daily target': 'Khoáng chất, mỗi chất theo % mục tiêu ngày',
    '🍬 Sugar inside whole fruit, vegetables and plain milk is fine; the sugars to limit are added sugar, honey, syrups, juice, soft drinks and sweets.':
      '🍬 Đường trong trái cây, rau nguyên và sữa không đường thì không sao; đường cần hạn chế là đường thêm vào, mật ong, siro, nước ép, nước ngọt và bánh kẹo.',
    '🫘 Purines from beans, tofu, vegetables, dairy and eggs don\'t raise gout risk; the ones to limit come from meat, seafood, broths, fish sauce and beer.':
      '🫘 Purin từ đậu, đậu phụ, rau, sữa và trứng không làm tăng nguy cơ gút; purin cần hạn chế đến từ thịt, hải sản, nước dùng, nước mắm và bia.',

    // ---- Today ----
    'Enter your health profile (weight, height, age, lab results...) so the app knows how much of each nutrient you need.':
      'Nhập hồ sơ sức khỏe (cân nặng, chiều cao, tuổi, kết quả xét nghiệm...) để ứng dụng biết bạn cần bao nhiêu mỗi chất.',
    'Your profile is saved. Now work out your daily nutrition targets.': 'Hồ sơ đã lưu. Giờ hãy tính mục tiêu dinh dưỡng mỗi ngày.',
    'Enter health profile': 'Nhập hồ sơ sức khỏe',
    'Work out daily targets': 'Tính mục tiêu mỗi ngày',
    'No meals yet.': 'Chưa có bữa ăn nào.',
    'No meals.': 'Không có bữa ăn.',
    '+ Exercise': '+ Bài tập',
    '+ Meal': '+ Bữa ăn',
    'Figures are AI estimates and don\'t replace a doctor\'s advice.': 'Số liệu do AI ước tính, không thay thế lời khuyên của bác sĩ.',
    'Before eating, tap "+ Meal" and take a photo of the food.': 'Trước khi ăn, bấm "+ Bữa ăn" và chụp ảnh món ăn.',
    'Tap a meal to see its name, tap again to open it · drag it to the bin to delete.': 'Chạm vào bữa ăn để xem tên, chạm lần nữa để mở · kéo vào thùng rác để xóa.',
    '🤖 What to eat next today?': '🤖 Hôm nay ăn gì tiếp?',
    'Still short': 'Còn thiếu',
    'Already high / avoid': 'Đã cao / nên tránh',
    'Ideas for the rest of the day': 'Gợi ý cho phần còn lại của ngày',
    'The AI looks at what you\'ve eaten today, tells you which nutrients are short or already too high, and suggests what to eat for the rest of the day.':
      'AI xem hôm nay bạn đã ăn gì, cho biết chất nào còn thiếu hoặc đã quá cao, và gợi ý nên ăn gì cho phần còn lại của ngày.',
    'Update suggestions': 'Cập nhật gợi ý',
    'Analyze & suggest': 'Phân tích & gợi ý',
    'Please work out your daily targets in Profile first.': 'Hãy tính mục tiêu mỗi ngày ở Hồ sơ trước.',
    'Claude is planning the rest of your day...': 'Claude đang lên kế hoạch cho phần còn lại của ngày...',

    // ---- Exercise ----
    '🏃 Exercise': '🏃 Bài tập',
    'Choose an exercise': 'Chọn bài tập',
    'Tap an exercise to add more times / minutes · drag it to the bin to delete.': 'Chạm vào bài tập để thêm lần / phút · kéo vào thùng rác để xóa.',
    'No exercise yet today? Add it here and the day\'s energy target goes up to match.': 'Hôm nay chưa tập? Thêm ở đây, mục tiêu năng lượng của ngày sẽ tăng theo.',
    'Skin in the sun': 'Da phơi nắng',
    'Time of day': 'Thời điểm',
    'No sunscreen, not through glass; heavy cloud means the skin makes less.': 'Không bôi kem chống nắng, không qua kính; trời nhiều mây thì da tạo ít hơn.',
    'Please choose an exercise.': 'Hãy chọn một bài tập.',
    'Please enter the amount to add.': 'Hãy nhập số lượng cần thêm.',
    'Sets': 'Hiệp',
    'Times': 'Số lần',
    'Minutes': 'Số phút',
    'Kilometers': 'Số km',
    'sets': 'hiệp',
    'times': 'lần',
    'min': 'phút',
    'Skipping (6mm Rope)': 'Nhảy dây (dây 6mm)',
    'Sit-up': 'Gập bụng',
    'Plank': 'Plank',
    'Push-up': 'Hít đất',
    'Bench Dip': 'Chống đẩy ghế (Bench Dip)',
    'Kettlebell Halo (5kg)': 'Kettlebell Halo (5kg)',
    'Kettlebell Around the World (5kg)': 'Kettlebell vòng quanh người (5kg)',
    'Goblet Squat (5kg)': 'Goblet Squat (5kg)',
    'Lunge': 'Chùng chân (Lunge)',
    'Kettlebell Goblet Curl (5kg)': 'Kettlebell Goblet Curl (5kg)',
    'Kettlebell Overhead Triceps Extension (5kg)': 'Kettlebell duỗi tay sau đầu (5kg)',
    'Badminton Set - 1 minute': 'Cầu lông - 1 phút',
    'Walking - by minute': 'Đi bộ - theo phút',
    'Walking - by kilometer': 'Đi bộ - theo km',
    'Sunbath': 'Tắm nắng',
    'Badminton Set - 10 mins': 'Cầu lông - 10 phút',
    'Badminton Set - 15 mins': 'Cầu lông - 15 phút',
    'Badminton': 'Cầu lông',
    'Skipping': 'Nhảy dây',
    'Sit-up / squat': 'Gập bụng / squat',
    'Running': 'Chạy bộ',
    'Brisk walking': 'Đi bộ nhanh',
    'Cycling': 'Đạp xe',
    'Swimming': 'Bơi',
    'Weights / gym': 'Tạ / gym',
    'Football': 'Bóng đá',
    'Tennis / pickleball': 'Tennis / pickleball',
    'Yoga / stretching': 'Yoga / giãn cơ',
    'Other (moderate)': 'Khác (vừa sức)',
    'Walk': 'Đi bộ',
    'Bench dip': 'Bench dip',
    'Halo': 'Halo',
    'Around world': 'Vòng quanh',
    'Goblet squat': 'Goblet squat',
    'Goblet curl': 'Goblet curl',
    'Triceps': 'Tay sau',
    'Walk (min)': 'Đi bộ (phút)',
    'Walk (km)': 'Đi bộ (km)',
    'Face + hands': 'Mặt + tay',
    'Arms + legs (T-shirt, shorts)': 'Tay + chân (áo thun, quần short)',
    'Most of the body': 'Gần hết cơ thể',
    'Early morning / late afternoon': 'Sáng sớm / chiều muộn',
    '10am–3pm (strong sun)': '10h–15h (nắng gắt)',
    'face + hands': 'mặt + tay',
    'arms + legs (t-shirt, shorts)': 'tay + chân (áo thun, quần short)',
    'most of the body': 'gần hết cơ thể',
    'early morning / late afternoon': 'sáng sớm / chiều muộn',

    // ---- Add meal / meal detail ----
    'Add meal': 'Thêm bữa ăn',
    '📷 Tap to take a photo of your meal': '📷 Chạm để chụp ảnh bữa ăn',
    'e.g. 1 bowl of rare beef pho, didn\'t finish the broth; 1 glass of iced tea': 'VD: 1 tô phở bò tái, không uống hết nước; 1 ly trà đá',
    'Date eaten': 'Ngày ăn',
    'Note (optional — what it is, how much, how it was cooked)': 'Ghi chú (không bắt buộc — món gì, bao nhiêu, nấu thế nào)',
    '🔍 Analyze meal': '🔍 Phân tích bữa ăn',
    'The AI estimates the foods, amounts and nutrients. Takes about 10–60 seconds.': 'AI ước tính các món, lượng và chất dinh dưỡng. Mất khoảng 10–60 giây.',
    'Analyze again': 'Phân tích lại',
    'This photo doesn\'t look like food. Take another photo of the meal, or describe it in the note.': 'Ảnh này không giống đồ ăn. Hãy chụp lại bữa ăn, hoặc mô tả trong ghi chú.',
    'How much will you eat?': 'Bạn sẽ ăn bao nhiêu?',
    'Nutrition (your portion)': 'Dinh dưỡng (phần của bạn)',
    '% = how much of your daily need this meal covers (for nutrients to limit: of the daily maximum).': '% = bữa này đáp ứng bao nhiêu nhu cầu mỗi ngày (với chất cần hạn chế: so với mức tối đa mỗi ngày).',
    '✅ Save — I\'ll eat this': '✅ Lưu — tôi sẽ ăn món này',
    'Discard': 'Bỏ',
    'Please take a photo of the meal or describe it in the note.': 'Hãy chụp ảnh bữa ăn hoặc mô tả trong ghi chú.',
    'Claude is looking at your meal...': 'Claude đang xem bữa ăn của bạn...',
    'This meal wasn\'t found.': 'Không tìm thấy bữa ăn này.',
    '🗑️ Delete meal': '🗑️ Xóa bữa ăn',
    'Could not read the photo.': 'Không đọc được ảnh.',
    'Choose from gallery': 'Chọn từ thư viện',
    'Take a photo': 'Chụp ảnh',
    'Breakfast': 'Bữa sáng',
    'Lunch': 'Bữa trưa',
    'Dinner': 'Bữa tối',
    'Snack': 'Bữa phụ',

    // ---- History / summary ----
    'No data yet.': 'Chưa có dữ liệu.',
    '📊 Summary': '📊 Tổng kết',
    'Adds up all meals and exercise in the period you choose.': 'Cộng tất cả bữa ăn và bài tập trong khoảng thời gian bạn chọn.',
    'This month': 'Tháng này',
    'Show summary': 'Xem tổng kết',
    'Please choose a start date and an end date.': 'Hãy chọn ngày bắt đầu và ngày kết thúc.',
    'No data in this period.': 'Không có dữ liệu trong khoảng này.',
    '🍽️ Total nutrition': '🍽️ Tổng dinh dưỡng',
    'No daily targets yet, so there is nothing to compare with. Work out your targets in Profile.': 'Chưa có mục tiêu ngày nên chưa có gì để so. Hãy tính mục tiêu ở Hồ sơ.',

    // ---- Profile ----
    'Health profile': 'Hồ sơ sức khỏe',
    '— Choose —': '— Chọn —',
    'Basic information': 'Thông tin cơ bản',
    'Sex': 'Giới tính',
    'Male': 'Nam',
    'Female': 'Nữ',
    'Date of birth': 'Ngày sinh',
    'Height (cm)': 'Chiều cao (cm)',
    'Weight (kg)': 'Cân nặng (kg)',
    'Activity level': 'Mức vận động',
    'Sedentary (mostly sitting)': 'Ít vận động (ngồi nhiều)',
    'Lightly active (1–3 sessions/week)': 'Vận động nhẹ (1–3 buổi/tuần)',
    'Moderately active (3–5 sessions/week)': 'Vận động vừa (3–5 buổi/tuần)',
    'Very active (6–7 sessions/week)': 'Vận động nhiều (6–7 buổi/tuần)',
    'Heavy physical work': 'Lao động nặng',
    'Daily targets are for a day without exercise. On days you exercise, log it in Workout and that day\'s energy goes up to match.':
      'Mục tiêu ngày tính cho ngày không tập. Ngày nào có tập, hãy ghi ở Tập luyện, năng lượng của ngày đó sẽ tăng theo.',
    'Goal': 'Mục tiêu',
    'Keep weight': 'Giữ cân',
    'Lose weight': 'Giảm cân',
    'Gain weight': 'Tăng cân',
    'Build muscle': 'Tăng cơ',
    'Medical conditions, medicines': 'Bệnh lý, thuốc đang dùng',
    'e.g. gout, type 2 diabetes, high blood pressure; taking metformin': 'VD: gút, tiểu đường type 2, cao huyết áp; đang uống metformin',
    'Diet, allergies, preferences': 'Chế độ ăn, dị ứng, sở thích',
    'e.g. allergic to shrimp, can\'t eat spicy food, vegetarian on full-moon days': 'VD: dị ứng tôm, không ăn cay được, ăn chay ngày rằm',
    'Save profile': 'Lưu hồ sơ',
    'Please enter at least sex, date of birth, height and weight.': 'Hãy nhập ít nhất giới tính, ngày sinh, chiều cao và cân nặng.',
    'Profile saved.': 'Đã lưu hồ sơ.',
    '🎯 Daily targets': '🎯 Mục tiêu mỗi ngày',
    'The AI works out how much of each nutrient you need (and the maximum) from your profile and lab results.':
      'AI tính bạn cần bao nhiêu mỗi chất (và mức tối đa) dựa trên hồ sơ và kết quả xét nghiệm.',
    'Your profile, lab results or the app\'s target rules (e.g. the new sugar and purine limits) changed after the last calculation. Worth recalculating.':
      'Hồ sơ, kết quả xét nghiệm hoặc quy tắc tính mục tiêu của ứng dụng (VD: giới hạn đường và purin mới) đã thay đổi sau lần tính trước. Nên tính lại.',
    'Lab results to watch': 'Kết quả xét nghiệm cần lưu ý',
    '▸ Show target table': '▸ Xem bảng mục tiêu',
    '▾ Hide target table': '▾ Ẩn bảng mục tiêu',
    'Recalculate targets': 'Tính lại mục tiêu',
    'Please save your profile first.': 'Hãy lưu hồ sơ trước.',
    'Claude is working out your nutrition targets...': 'Claude đang tính mục tiêu dinh dưỡng của bạn...',
    '🧪 Blood & urine tests': '🧪 Xét nghiệm máu & nước tiểu',
    'No date — will be saved as today': 'Không có ngày — sẽ lưu là hôm nay',
    'Add the ticked lines': 'Thêm các dòng đã chọn',
    'No lab results yet.': 'Chưa có kết quả xét nghiệm.',
    'Take or choose photos of your lab reports (several pages or reports are fine) — the AI reads them for you:':
      'Chụp hoặc chọn ảnh phiếu xét nghiệm (nhiều trang hoặc nhiều phiếu đều được) — AI sẽ đọc giúp bạn:',
    '📋 Sent the photos to Claude? Paste the reply here': '📋 Đã gửi ảnh cho Claude? Dán câu trả lời vào đây',
    'Test date': 'Ngày xét nghiệm',
    'Test name': 'Tên xét nghiệm',
    'e.g. Uric acid, Glucose, LDL-C': 'VD: Axit uric, Glucose, LDL-C',
    'e.g. µmol/L': 'VD: µmol/L',
    'e.g. 480': 'VD: 480',
    'e.g. 202–416': 'VD: 202–416',
    'e.g. 20': 'VD: 20',
    'Reference range (if any)': 'Khoảng tham chiếu (nếu có)',
    'Add result': 'Thêm kết quả',
    'Please enter the test name and the result.': 'Hãy nhập tên xét nghiệm và kết quả.',
    '✍️ Enter a result by hand': '✍️ Nhập kết quả bằng tay',
    'Lab report photo': 'Ảnh phiếu xét nghiệm',
    '📷 Take another': '📷 Chụp thêm',
    '📷 Take photo': '📷 Chụp ảnh',
    '🖼️ Choose photos': '🖼️ Chọn ảnh',
    'No results could be read. Take a sharper photo, in good light, with the report straight.': 'Không đọc được kết quả nào. Hãy chụp rõ hơn, đủ sáng, để phiếu thẳng.',
    'Remove all photos': 'Bỏ tất cả ảnh',
    'Uric acid': 'Axit uric',

    // ---- Settings ----
    '🤖 How to ask the AI': '🤖 Cách hỏi AI',
    'Through the Claude app (free with a Pro plan)': 'Qua ứng dụng Claude (miễn phí với gói Pro)',
    'The app sends the question and photos to the Claude app; you tap send, copy the reply and paste it back here. Counts toward your Pro plan\'s usage limits.':
      'Ứng dụng gửi câu hỏi và ảnh sang ứng dụng Claude; bạn bấm gửi, sao chép câu trả lời rồi dán lại vào đây. Tính vào hạn mức của gói Pro.',
    'Google Gemini (free)': 'Google Gemini (miễn phí)',
    'One tap, the result shows straight in the app. Needs a free Gemini API key from aistudio.google.com (limited uses per day).':
      'Một chạm, kết quả hiện ngay trong ứng dụng. Cần API key Gemini miễn phí từ aistudio.google.com (giới hạn lượt mỗi ngày).',
    'Groq (free, very fast)': 'Groq (miễn phí, rất nhanh)',
    'One tap, usually answers in a few seconds. Needs a free Groq API key from console.groq.com. May read food photos less accurately than Gemini.':
      'Một chạm, thường trả lời trong vài giây. Cần API key Groq miễn phí từ console.groq.com. Có thể đọc ảnh món ăn kém chính xác hơn Gemini.',
    'OpenRouter (free)': 'OpenRouter (miễn phí)',
    'One tap. Uses free models that read photos (Gemma, Nemotron...), chosen by the app. Free key from openrouter.ai; about 50 uses a day.':
      'Một chạm. Dùng các model miễn phí đọc được ảnh (Gemma, Nemotron...), do ứng dụng chọn. Key miễn phí từ openrouter.ai; khoảng 50 lượt mỗi ngày.',
    'Cohere (free, 1,000 uses/month)': 'Cohere (miễn phí, 1.000 lượt/tháng)',
    'One tap. Command A Vision model. Free trial key from dashboard.cohere.com, about 1,000 uses a month.':
      'Một chạm. Model Command A Vision. Key dùng thử miễn phí từ dashboard.cohere.com, khoảng 1.000 lượt mỗi tháng.',
    'Claude API key (paid per use)': 'API key Claude (trả phí theo lượt)',
    'One tap, the result shows straight in the app. Needs an API key and credit at console.anthropic.com (a few cents per meal).':
      'Một chạm, kết quả hiện ngay trong ứng dụng. Cần API key và tín dụng tại console.anthropic.com (vài xu mỗi bữa).',
    'API key': 'API key',
    'Cohere API key': 'API key Cohere',
    'Show / hide key': 'Hiện / ẩn key',
    'Testing...': 'Đang thử...',
    '🧪 Test key': '🧪 Thử key',
    'Save key': 'Lưu key',
    'Note: on the free plan, Google may use what you send (photos, profile, lab results) to improve its products.':
      'Lưu ý: ở gói miễn phí, Google có thể dùng những gì bạn gửi (ảnh, hồ sơ, kết quả xét nghiệm) để cải thiện sản phẩm.',
    'Fast (Flash-Lite)': 'Nhanh (Flash-Lite)',
    'Answers several times faster; good enough for everyday meals.': 'Trả lời nhanh hơn nhiều lần; đủ tốt cho bữa ăn hằng ngày.',
    'More careful (Flash)': 'Kỹ hơn (Flash)',
    'Slower but reads photos more carefully — use it for hard-to-read lab reports.': 'Chậm hơn nhưng đọc ảnh kỹ hơn — dùng cho phiếu xét nghiệm khó đọc.',
    'Groq reads at most 5 photos at a time; with more lab report photos, the app splits them into several requests.':
      'Groq đọc tối đa 5 ảnh mỗi lần; nếu nhiều ảnh phiếu xét nghiệm hơn, ứng dụng sẽ chia thành nhiều lần gửi.',
    'The app only uses models ending in ":free" (never charged) and moves to another free model when one is busy. Limit about 50 uses a day (1,000 if the account has ever topped up $10 or more).':
      'Ứng dụng chỉ dùng các model có đuôi ":free" (không bao giờ tính phí) và chuyển sang model miễn phí khác khi một model bận. Giới hạn khoảng 50 lượt mỗi ngày (1.000 nếu tài khoản từng nạp từ $10 trở lên).',
    'Note: free model providers may keep and use what you send.': 'Lưu ý: nhà cung cấp model miễn phí có thể lưu và dùng những gì bạn gửi.',
    'A trial key allows about 1,000 requests a month, for personal use only.': 'Key dùng thử cho khoảng 1.000 lượt mỗi tháng, chỉ dùng cá nhân.',
    '🔑 Claude API key': '🔑 API key Claude',
    'API key saved.': 'Đã lưu API key.',
    'API key removed.': 'Đã xóa API key.',
    '💵 Spending so far': '💵 Chi phí đến nay',
    'Estimated from Claude Opus 5.5 prices; see console.anthropic.com for the exact figure. A meal usually costs a few cents.':
      'Ước tính theo giá Claude Opus 5.5; xem số chính xác tại console.anthropic.com. Mỗi bữa thường tốn vài xu.',
    '🎨 Appearance': '🎨 Giao diện',
    'Same as my phone / computer': 'Theo điện thoại / máy tính',
    '🌐 Language': '🌐 Ngôn ngữ',
    '💾 Backup': '💾 Sao lưu',
    'Your data is only on this phone and will be lost if the app is uninstalled. Back up often (send the file to yourself by Zalo, Drive or email).':
      'Dữ liệu chỉ nằm trên điện thoại này và sẽ mất nếu gỡ ứng dụng. Hãy sao lưu thường xuyên (gửi file cho chính mình qua Zalo, Drive hoặc email).',
    'Your data (profile, blood/urine tests, meals, exercise, API keys) is only in this browser on this device — it isn\'t sent to any server. It is lost if you clear this site\'s browsing data, and it isn\'t there in another browser, on another device or in a private window. Back up often; use the backup file to move your data to another device.':
      'Dữ liệu của bạn (hồ sơ, xét nghiệm máu/nước tiểu, bữa ăn, bài tập, API key) chỉ nằm trong trình duyệt này trên thiết bị này — không gửi lên máy chủ nào. Dữ liệu sẽ mất nếu bạn xóa dữ liệu duyệt web của trang này, và không có ở trình duyệt khác, thiết bị khác hay cửa sổ ẩn danh. Hãy sao lưu thường xuyên; dùng file sao lưu để chuyển dữ liệu sang thiết bị khác.',
    '⬆️ Export backup file': '⬆️ Xuất file sao lưu',
    '⬇️ Restore from file': '⬇️ Khôi phục từ file',
    'ℹ️ About': 'ℹ️ Giới thiệu',
    'on the phone.': 'trên điện thoại.',
    'on this phone': 'trên điện thoại này',
    'in this browser': 'trong trình duyệt này',
    'in this browser.': 'trong trình duyệt này.',
    'There is an Android app:': 'Có ứng dụng Android:',
    'download the APK': 'tải file APK',
    '(the two don\'t sync — move data with a backup file).': '(hai bản không đồng bộ — chuyển dữ liệu bằng file sao lưu).',
    'Each AI request only sends today\'s data (the meal photo, the day\'s meals); earlier days are never sent.':
      'Mỗi lần hỏi AI chỉ gửi dữ liệu hôm nay (ảnh bữa ăn, các bữa trong ngày); những ngày trước không bao giờ được gửi.',
    'Nutrition figures are AI estimates and can be wrong. The app doesn\'t replace a doctor or a dietitian.':
      'Số liệu dinh dưỡng do AI ước tính và có thể sai. Ứng dụng không thay thế bác sĩ hay chuyên gia dinh dưỡng.',
    'The browser has agreed to keep the data for good.': 'Trình duyệt đã đồng ý giữ dữ liệu lâu dài.',
    'The browser hasn\'t promised to keep it for good (it may clear it when the device runs low on space) — add the page to your home screen or bookmark it, and remember to back up.':
      'Trình duyệt chưa cam kết giữ dữ liệu lâu dài (có thể xóa khi máy sắp hết dung lượng) — hãy thêm trang ra màn hình chính hoặc đánh dấu trang, và nhớ sao lưu.',
    'Save backup file': 'Lưu file sao lưu',
    'The file could not be read.': 'Không đọc được file.',
    'Restored.': 'Đã khôi phục.',

    // ---- Asking Claude through the app ----
    'Ask Claude': 'Hỏi Claude',
    'Choose the Claude app': 'Chọn ứng dụng Claude',
    'Hold this box → Paste': 'Giữ ô này → Dán',
    'Paste Claude\'s reply': 'Dán câu trả lời của Claude',
    '📋 Paste Claude\'s reply': '📋 Dán câu trả lời của Claude',
    'Claude\'s reply isn\'t on the clipboard. Paste the reply here:': 'Không có câu trả lời của Claude trong bộ nhớ tạm. Dán câu trả lời vào đây:',
    'Choose the Claude app → tap send → when Claude has answered, tap Copy under the reply → come back here and tap "Paste Claude\'s reply". If the question doesn\'t appear in Claude, hold the message box and choose Paste.':
      'Chọn ứng dụng Claude → bấm gửi → khi Claude trả lời xong, bấm Sao chép dưới câu trả lời → quay lại đây và bấm "Dán câu trả lời của Claude". Nếu câu hỏi không hiện trong Claude, giữ ô nhập tin nhắn và chọn Dán.',
    'No API key yet. Go to Settings to enter an API key, or choose asking through the Claude app (free).':
      'Chưa có API key. Vào Cài đặt để nhập API key, hoặc chọn hỏi qua ứng dụng Claude (miễn phí).',

    // ---- AI error messages (ai.js) ----
    'No API key yet. Go to Settings to enter your Anthropic API key.': 'Chưa có API key. Vào Cài đặt để nhập API key Anthropic.',
    'The API key is wrong or has been disabled. Check it in Settings.': 'API key sai hoặc đã bị vô hiệu. Hãy kiểm tra trong Cài đặt.',
    'Too many requests, or the account is over its limit. Wait a moment and try again.': 'Quá nhiều yêu cầu, hoặc tài khoản đã vượt hạn mức. Đợi một lát rồi thử lại.',
    'The Anthropic account is out of credit. Top up at console.anthropic.com.': 'Tài khoản Anthropic đã hết tín dụng. Nạp thêm tại console.anthropic.com.',
    'Could not reach Claude. Check your connection and try again.': 'Không kết nối được Claude. Kiểm tra kết nối mạng rồi thử lại.',
    'Claude did not answer this request. Try another photo or a clearer note.': 'Claude không trả lời yêu cầu này. Hãy thử ảnh khác hoặc ghi chú rõ hơn.',
    'Claude\'s reply was in the wrong format. Try again.': 'Câu trả lời của Claude sai định dạng. Hãy thử lại.',
    'The pasted text is incomplete or broken (maybe not all of it was copied). Copy the whole reply again.': 'Đoạn đã dán bị thiếu hoặc lỗi (có thể chưa sao chép hết). Hãy sao chép lại toàn bộ câu trả lời.',
    'No JSON result found in the pasted text. Copy Claude\'s whole reply and paste it again.': 'Không tìm thấy kết quả JSON trong đoạn đã dán. Hãy sao chép toàn bộ câu trả lời của Claude và dán lại.',
    'Claude\'s reply doesn\'t match the expected format. Ask Claude to "reply again in the exact JSON format", then copy and paste it again.':
      'Câu trả lời của Claude không đúng định dạng. Hãy nhờ Claude "reply again in the exact JSON format", rồi sao chép và dán lại.',
    'Gemini did not answer this request. Try another photo or a clearer note.': 'Gemini không trả lời yêu cầu này. Hãy thử ảnh khác hoặc ghi chú rõ hơn.',
    'Gemini\'s reply was cut off. Try again (with fewer photos).': 'Câu trả lời của Gemini bị cắt ngang. Hãy thử lại (với ít ảnh hơn).',
    'Groq has no model that reads photos for this key right now. Use Gemini instead.': 'Hiện Groq không có model đọc ảnh cho key này. Hãy dùng Gemini.',
    'OpenRouter has no free model that reads photos right now. Use Gemini or Groq instead.': 'Hiện OpenRouter không có model miễn phí đọc được ảnh. Hãy dùng Gemini hoặc Groq.',
    'Please paste an API key first.': 'Hãy dán API key trước.'
  };

  var DAY_NAMES = { Sun: 'CN', Mon: 'Th 2', Tue: 'Th 3', Wed: 'Th 4', Thu: 'Th 5', Fri: 'Th 6', Sat: 'Th 7' };

  // Patterns for texts built with numbers or names. In the Vietnamese text, $n is the n-th captured
  // part as it is, @n is that part translated, and %n is a comma-separated list translated item by item.
  var PATTERNS = [
    [/^Today · (.+)$/, 'Hôm nay · $1'],
    [/^Food · (.+)$/, 'Bữa ăn · $1'],
    [/^Workout · (.+)$/, 'Tập luyện · $1'],
    [/^Add meal · (.+)$/, 'Thêm bữa ăn · $1'],
    [/^Calculated on (.+)$/, 'Tính ngày $1'],
    [/^Version (.+)$/, 'Phiên bản $1'],
    [/^Meals \((\d+)\)$/, 'Bữa ăn ($1)'],
    [/^(\d+) meals?$/, '$1 bữa'],
    [/^(\d+) days?$/, '$1 ngày'],
    [/^(\d+) days? · (.+)$/, '$1 ngày · $2'],
    [/^(\d+) meals?((?: · 🏃 ~[\d.,]+ kcal)?)(?: · over: (.+))?$/, function (m) {
      return m[1] + ' bữa' + m[2] + (m[3] ? ' · vượt: ' + list(m[3]) : '');
    }],
    [/^(\d+) days?; meals logged on (\d+) days?$/, '$1 ngày; có ghi bữa ăn $2 ngày'],
    [/^(\d+) exercise entries on (\d+) days?, burning an extra ~(.+) kcal$/, '$1 lần tập trong $2 ngày, đốt thêm ~$3 kcal'],
    [/^"Need" is what your body needed over the (\d+) days? with meals logged, from the daily targets in Profile( \(raised for the days with exercise\))?\. ✅ enough · ⬇️ short · ⬆️ over\.$/, function (m) {
      return '"Cần" là lượng cơ thể bạn cần trong ' + m[1] + ' ngày có ghi bữa ăn, theo mục tiêu ngày ở Hồ sơ'
        + (m[2] ? ' (đã tăng cho những ngày có tập)' : '') + '. ✅ đủ · ⬇️ thiếu · ⬆️ vượt.';
    }],
    [/^Daily averages are over the (\d+) days? with meals logged \(a day with nothing logged was probably just forgotten\)\.$/,
      'Trung bình mỗi ngày tính trên $1 ngày có ghi bữa ăn (ngày không ghi gì có lẽ chỉ là quên ghi).'],
    [/^✅ Enough: (\d+)$/, '✅ Đủ: $1'],
    [/^⬇️ Short: (\d+)$/, '⬇️ Thiếu: $1'],
    [/^⬆️ Over: (\d+)$/, '⬆️ Vượt: $1'],
    [/^🏃 Total exercise \(~(.+) kcal\)$/, '🏃 Tổng bài tập (~$1 kcal)'],
    [/^🏃 Exercise \(~(.+) kcal\)$/, '🏃 Bài tập (~$1 kcal)'],
    [/^⚠️ (.+) were analysed before they were split by source, so they only count in the totals; the by-source rows are lower than they really were\.$/, function (m) {
      var parts = m[1].split(' and ').map(function (p) {
        var x = /^(\d+) meals?'s? (sugars|purines)$/.exec(p);
        return x ? (x[2] === 'sugars' ? 'đường' : 'purin') + ' của ' + x[1] + ' bữa' : p;
      });
      var what = parts.join(' và ');
      return '⚠️ ' + what.charAt(0).toUpperCase() + what.slice(1) + ' được phân tích trước khi tách theo nguồn, nên chỉ được tính vào tổng; các dòng theo nguồn thấp hơn thực tế.';
    }],
    // Rose chart labels, tooltips and screen-reader text.
    [/^(.+): (.+?), (\d+)% of target \((.+)\)\. (.+)\.$/, function (m) {
      return t(m[1]) + ': ' + m[2] + ', ' + m[3] + '% mục tiêu (' + t(m[4]) + '). ' + t(m[5]) + '.';
    }],
    [/^(.+): (.+?)\.$/, function (m) {
      return VI[m[1]] ? t(m[1]) + ': ' + m[2] + '.' : null;
    }],
    [/^(\d+)% of daily target$/, '$1% mục tiêu ngày'],
    [/^Target: (.+)$/, 'Mục tiêu: @1'],
    [/^at least (.+)$/, 'ít nhất $1'],
    [/^at most (.+)$/, 'tối đa $1'],
    [/^Over by (.+)$/, 'Vượt $1'],
    [/^Short by (.+)$/, 'Thiếu $1'],
    [/^(✅|⬇️|⬆️) (.+)$/, function (m) {
      var x = t(m[2]);
      return x !== m[2] ? m[1] + ' ' + x : null;
    }],
    [/^(.+) · max (.+)$/, '$1 · tối đa $2'],
    // Meals and exercise bubbles.
    [/^(.+), (.+) kcal, (\d\d:\d\d)\. Tap to select, tap again to open; drag to the bin to delete\.$/,
      '@1, $2 kcal, $3. Chạm để chọn, chạm lần nữa để mở; kéo vào thùng rác để xóa.'],
    [/^(.+), ([\d.,]+) (times|min|km|sets), ~(.+) kcal$/, function (m) {
      return t(m[1]) + ', ' + m[2] + ' ' + t(m[3]) + ', ~' + m[4] + ' kcal';
    }],
    [/^(.+) · ([\d.,]+) (times|min|km|sets)$/, function (m) {
      return t(m[1]) + ' · ' + m[2] + ' ' + t(m[3]);
    }],
    [/^([\d.,]+) (times|min|sets)$/, '$1 @2'],
    [/^(.+) deleted$/, 'Đã xóa @1'],
    [/^Delete (.+)$/, 'Xóa @1'],
    [/^☀️ ~(.+) µg vitamin D · (.+), (.+)$/, '☀️ ~$1 µg vitamin D · @2, @3'],
    [/^☀️ Your skin makes about (.+) µg vitamin D \(~(\d+) IU\)( — only the first (\d+) minutes count; after that the skin makes almost no more)?\.$/, function (m) {
      return '☀️ Da bạn tạo khoảng ' + m[1] + ' µg vitamin D (~' + m[2] + ' IU)'
        + (m[3] ? ' — chỉ ' + m[4] + ' phút đầu được tính; sau đó da gần như không tạo thêm' : '') + '.';
    }],
    [/^≈ (\d+) min, burns an extra ~(.+) kcal( \(based on (.+) kg — enter your weight in Profile to be more accurate\))?$/, function (m) {
      return '≈ ' + m[1] + ' phút, đốt thêm ~' + m[2] + ' kcal' + (m[3] ? ' (tính theo ' + m[4] + ' kg — nhập cân nặng ở Hồ sơ để chính xác hơn)' : '');
    }],
    [/^Total: (.+) = ([\d.,]+) (times|min|km|sets), ~(.+) kcal(, ☀️ ~(.+) µg vitamin D)?$/, function (m) {
      return 'Tổng: ' + m[1] + ' = ' + m[2] + ' ' + t(m[3]) + ', ~' + m[4] + ' kcal' + (m[5] ? ', ☀️ ~' + m[6] + ' µg vitamin D' : '');
    }],
    [/^Add (times|min|km|sets) to (.+)$/, 'Thêm @1 cho @2'],
    [/^Please enter the (.+)\.$/, function (m) {
      return 'Hãy nhập ' + t(m[1].charAt(0).toUpperCase() + m[1].slice(1)).toLowerCase() + '.';
    }],
    // Plan for the rest of the day.
    [/^Updated at (\d\d:\d\d) \(after (\d+) meals?\)(?: · (new meals since|exercise has changed), worth updating)?$/, function (m) {
      return 'Cập nhật lúc ' + m[1] + ' (sau ' + m[2] + ' bữa)'
        + (m[3] ? ' · ' + (m[3] === 'new meals since' ? 'đã có bữa mới' : 'bài tập đã thay đổi') + ', nên cập nhật' : '');
    }],
    [/^(.+): over by (.+)$/, '@1: vượt $2'],
    [/^(.+): ([\d.,]+ (?:g|mg|µg|kcal))$/, function (m) {
      return VI[m[1]] ? t(m[1]) + ': ' + m[2] : null;
    }],
    // Meal result and meal page.
    [/^Confidence: (low|medium|high)$/, 'Độ tin cậy: @1'],
    [/^📈 After this meal, today will be over the limit for: (.+)$/, function (m) {
      // "Saturated fat (24 / 20 g), Sodium (salt) (915 / 20 mg)": names may have commas and brackets.
      return '📈 Sau bữa này, hôm nay sẽ vượt giới hạn: ' + m[1].split(/ \(([^()]*\/[^()]*)\)(?:, )?/).map(function (part, i) {
        return i % 2 ? ' (' + part + ')' + ', ' : t(part);
      }).join('').replace(/, $/, '');
    }],
    [/^📅 This meal will be saved to (.+)$/, '📅 Bữa này sẽ được lưu vào $1'],
    [/^The full photo is kept for (\d+) days, then only the small one remains\.$/, 'Ảnh đầy đủ được giữ $1 ngày, sau đó chỉ còn ảnh nhỏ.'],
    [/^The full photo is older than (\d+) days, so only the small one remains\.$/, 'Ảnh đầy đủ đã quá $1 ngày nên chỉ còn ảnh nhỏ.'],
    [/^(.+) · (\d\d:\d\d) · ate (\d+)%$/, '$1 · $2 · ăn $3%'],
    [/^Note: (.+)$/, 'Ghi chú: $1'],
    [/^Delete the meal "(.+)"\?$/, 'Xóa bữa ăn "$1"?'],
    [/^Could not save: (.+)$/, 'Không lưu được: @1'],
    [/^Could not get the photo: (.+)$/, 'Không lấy được ảnh: @1'],
    [/^Could not open sharing: (.+)$/, 'Không mở được chia sẻ: @1'],
    [/^Question copied( and (\d+) photo\(s\) downloaded \(Downloads folder\))?\. Open claude\.ai, paste the question(, attach the downloaded photo\(s\))? and send\.$/, function (m) {
      return 'Đã sao chép câu hỏi' + (m[1] ? ' và tải ' + m[2] + ' ảnh (thư mục Downloads)' : '')
        + '. Mở claude.ai, dán câu hỏi' + (m[3] ? ', đính kèm ảnh đã tải' : '') + ' rồi gửi.';
    }],
    [/^📤 (.+) — send to the Claude app$/, '📤 @1 — gửi sang ứng dụng Claude'],
    [/^📤 🔍 (.+) — send to the Claude app$/, '📤 🔍 @1 — gửi sang ứng dụng Claude'],
    // Lab results.
    [/^At most (\d+) photos per read\. Only the first (\d+) were taken\.$/, 'Tối đa $1 ảnh mỗi lần đọc. Chỉ lấy $2 ảnh đầu.'],
    [/^(\d+) photos?(?: \(maximum\))?\. Tap ✕ to drop a bad photo\.$/, function (m) {
      return m[1] + ' ảnh' + (/maximum/.test(m[0]) ? ' (tối đa)' : '') + '. Chạm ✕ để bỏ ảnh không đạt.';
    }],
    [/^Photo (\d+)$/, 'Ảnh $1'],
    [/^Remove photo (\d+)$/, 'Bỏ ảnh $1'],
    [/^🔍 Read (\d+) photos?$/, '🔍 Đọc $1 ảnh'],
    [/^Claude is reading (\d+) lab report photos?\.\.\.$/, 'Claude đang đọc $1 ảnh phiếu xét nghiệm...'],
    [/^The AI read (\d+) results?\. Check them against the report and untick any wrong lines\.$/, 'AI đọc được $1 kết quả. Hãy đối chiếu với phiếu và bỏ chọn dòng nào sai.'],
    [/^Date (.+)$/, 'Ngày $1'],
    [/^(Blood|Urine|Other) · (.+?)(?: · reference (.+))?$/, function (m) {
      return t(m[1]) + ' · ' + m[2] + (m[3] ? ' · tham chiếu ' + m[3] : '');
    }],
    [/^(Blood|Urine|Other)( · reference (.+))?$/, function (m) {
      return t(m[1]) + (m[2] ? ' · tham chiếu ' + m[3] : '');
    }],
    [/^: (.+) \(reference (.+)\)$/, ': $1 (tham chiếu $2)'],
    [/^(.+) \((low|high|normal|unclear)\):$/, '@1 (@2):'],
    [/^Delete the result "(.+)"\?$/, 'Xóa kết quả "$1"?'],
    // Settings.
    [/^🔑 (.+) API key$/, '🔑 API key $1'],
    [/^(.+) API key saved\.$/, 'Đã lưu API key $1.'],
    [/^(.+) API key removed\.$/, 'Đã xóa API key $1.'],
    [/^✅ Key works — model (.+), answered in (.+) seconds\.$/, '✅ Key dùng được — model $1, trả lời trong $2 giây.'],
    [/^❌ (.+)$/, '❌ @1'],
    [/^Go to aistudio\.google\.com\/apikey → sign in with Google → "Create API key" → copy it and paste it here\. Free, no card needed\. The key is stored only (.+)\.$/,
      'Vào aistudio.google.com/apikey → đăng nhập bằng Google → "Create API key" → sao chép rồi dán vào đây. Miễn phí, không cần thẻ. Key chỉ được lưu @1.'],
    [/^Go to console\.groq\.com → sign in \(Google or email\) → API Keys → "Create API Key" → copy it and paste it here\. Free, no card needed\. The key is stored only (.+)\.$/,
      'Vào console.groq.com → đăng nhập (Google hoặc email) → API Keys → "Create API Key" → sao chép rồi dán vào đây. Miễn phí, không cần thẻ. Key chỉ được lưu @1.'],
    [/^Go to openrouter\.ai → sign in \(Google, GitHub or email\) → Keys → "Create API Key" → copy it and paste it here\. Free, no card needed\. The key is stored only (.+)\.$/,
      'Vào openrouter.ai → đăng nhập (Google, GitHub hoặc email) → Keys → "Create API Key" → sao chép rồi dán vào đây. Miễn phí, không cần thẻ. Key chỉ được lưu @1.'],
    [/^Go to dashboard\.cohere\.com → sign up → API Keys → copy the "Trial key" and paste it here\. Free, no card needed\. The key is stored only (.+)\.$/,
      'Vào dashboard.cohere.com → đăng ký → API Keys → sao chép "Trial key" rồi dán vào đây. Miễn phí, không cần thẻ. Key chỉ được lưu @1.'],
    [/^Create a key at console\.anthropic\.com → API Keys, then paste it here\. The key is stored only (.+)\.$/,
      'Tạo key tại console.anthropic.com → API Keys, rồi dán vào đây. Key chỉ được lưu @1.'],
    [/^About \$([\d.]+) for (\d+) requests to Claude\.$/, 'Khoảng $$$1 cho $2 lần hỏi Claude.'],
    [/^Meal photos, your profile and lab results are sent to Anthropic \(Claude\), Google \(Gemini\), Groq, OpenRouter or Cohere, depending on the chosen AI, each time you ask for an analysis; otherwise all data stays (.+)$/,
      'Ảnh bữa ăn, hồ sơ và kết quả xét nghiệm được gửi tới Anthropic (Claude), Google (Gemini), Groq, OpenRouter hoặc Cohere, tùy AI đã chọn, mỗi khi bạn yêu cầu phân tích; ngoài ra mọi dữ liệu đều nằm @1'],
    [/^Full meal photos are kept for (\d+) days and then deleted; the small photos in History are kept for good\. Backup files don't include the full photos\.$/,
      'Ảnh bữa ăn đầy đủ được giữ $1 ngày rồi xóa; ảnh nhỏ trong Lịch sử được giữ lâu dài. File sao lưu không gồm ảnh đầy đủ.'],
    [/^📦 Using (.+) MB in the browser\. (.+)$/, '📦 Đang dùng $1 MB trong trình duyệt. @2'],
    [/^Could not export the file: (.+)$/, 'Không xuất được file: @1'],
    [/^Restoring will REPLACE all current data with the backup file \((\d+) meals?\)\. Continue\?$/, 'Khôi phục sẽ THAY THẾ toàn bộ dữ liệu hiện tại bằng file sao lưu ($1 bữa ăn). Tiếp tục?'],
    // AI errors with a service name in them (ai.js).
    [/^Request refused: (.+)$/, 'Yêu cầu bị từ chối: $1'],
    [/^Claude is busy or had an error \((.+)\)\. Try again in a few minutes\.$/, 'Claude đang bận hoặc gặp lỗi ($1). Hãy thử lại sau vài phút.'],
    [/^The (.+) API key is wrong or not enabled\. Check it in Settings\.$/, 'API key $1 sai hoặc chưa được bật. Hãy kiểm tra trong Cài đặt.'],
    [/^(.+)'s free allowance is used up \(per-minute or per-day limit\)\. Wait a little, or try again tomorrow\.$/, '$1 đã hết lượt miễn phí (giới hạn theo phút hoặc theo ngày). Đợi một chút, hoặc thử lại vào ngày mai.'],
    [/^The request is too large for (.+)'s free plan\. Try with fewer photos\.$/, 'Yêu cầu quá lớn với gói miễn phí của $1. Hãy thử với ít ảnh hơn.'],
    [/^(.+) is busy or had an error \((.+)\)\. Try again in a few minutes\.$/, '$1 đang bận hoặc gặp lỗi ($2). Hãy thử lại sau vài phút.'],
    [/^(.+) refused the request: (.+)$/, '$1 từ chối yêu cầu: $2'],
    [/^Could not reach (.+)\. Check your connection and try again\.$/, 'Không kết nối được $1. Kiểm tra kết nối mạng rồi thử lại.'],
    [/^(.+) replied in the wrong format\. Try again\.$/, '$1 trả lời sai định dạng. Hãy thử lại.'],
    [/^(.+)'s reply was cut off\. Try again\.$/, 'Câu trả lời của $1 bị cắt ngang. Hãy thử lại.'],
    [/^(.+) did not answer this request\. Try again\.$/, '$1 không trả lời yêu cầu này. Hãy thử lại.'],
    [/^No (.+) API key yet\. Go to Settings to enter one\.$/, 'Chưa có API key $1. Vào Cài đặt để nhập.'],
    [/^(Gemini|Groq|OpenRouter|Cohere) is looking at your meal\.\.\.$/, '$1 đang xem bữa ăn của bạn...'],
    [/^(Gemini|Groq|OpenRouter|Cohere) is planning the rest of your day\.\.\.$/, '$1 đang lên kế hoạch cho phần còn lại của ngày...'],
    [/^(Gemini|Groq|OpenRouter|Cohere) is working out your nutrition targets\.\.\.$/, '$1 đang tính mục tiêu dinh dưỡng của bạn...'],
    [/^(Gemini|Groq|OpenRouter|Cohere) is reading (\d+) lab report photos?\.\.\.$/, '$1 đang đọc $2 ảnh phiếu xét nghiệm...'],
    [/^Error: (.+)$/, 'Lỗi: @1'],
    // Sub-parts: "↳ Rice" lines and the free-text names of food items stay as the AI wrote them.
    [/^— (.+)$/, function (m) {
      var x = t(m[1]);
      return x !== m[1] ? '— ' + x : null;
    }]
  ];

  function list(s) {
    return s.split(', ').map(t).join(', ');
  }

  var cache = {};

  /** The text in the chosen language (unchanged in English, or when no translation is known). */
  function t(s) {
    if (lang !== 'vi' || typeof s !== 'string') {
      return s;
    }
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    var core = m[2];
    if (!core || !/[A-Za-z]/.test(core)) {
      return s;
    }
    if (Object.prototype.hasOwnProperty.call(cache, core)) {
      return m[1] + cache[core] + m[3];
    }
    var out = translate(core);
    cache[core] = out;
    return m[1] + out + m[3];
  }

  function translate(core) {
    if (Object.prototype.hasOwnProperty.call(VI, core)) {
      return VI[core];
    }
    for (var i = 0; i < PATTERNS.length; i++) {
      var p = PATTERNS[i];
      var match = p[0].exec(core);
      if (!match) {
        continue;
      }
      var out = typeof p[1] === 'function' ? p[1](match) : p[1].replace(/([$@%])(\d)/g, function (all, kind, n) {
        var part = match[+n] || '';
        return kind === '$' ? part : kind === '@' ? t(part) : list(part);
      }).replace(/\$\$/g, '$');
      if (out !== null && out !== undefined) {
        return out;
      }
    }
    return core;
  }

  /** "Thu, 22 Oct 2026" style date for a YYYY-MM-DD key, in the chosen language. */
  var EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayTitle(key) {
    var p = key.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    if (lang === 'vi') {
      return DAY_NAMES[EN_DAYS[d.getDay()]] + ', ' + d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
    }
    return EN_DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + EN_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  // ---- Translating the page as it is drawn ----

  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

  function translateNode(node) {
    if (node.nodeType === 3) {
      var parent = node.parentNode;
      if (parent && /^(SCRIPT|STYLE|TEXTAREA)$/.test(parent.nodeName)) {
        return;
      }
      var v = node.nodeValue;
      var x = t(v);
      if (x !== v) {
        node.nodeValue = x;
      }
      return;
    }
    if (node.nodeType !== 1) {
      return;
    }
    translateAttrs(node);
    for (var c = node.firstChild; c; c = c.nextSibling) {
      translateNode(c);
    }
  }

  function translateAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (v) {
        var x = t(v);
        if (x !== v) {
          el.setAttribute(ATTRS[i], x);
        }
      }
    }
  }

  function start() {
    if (lang !== 'vi') {
      return;
    }
    document.documentElement.setAttribute('lang', 'vi');
    document.title = t(document.title);
    translateNode(document.body);
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        if (r.type === 'childList') {
          r.addedNodes.forEach(translateNode);
        } else if (r.type === 'characterData') {
          translateNode(r.target);
        } else {
          translateAttrs(r.target);
        }
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });

    var alert0 = window.alert;
    var confirm0 = window.confirm;
    var prompt0 = window.prompt;
    window.alert = function (msg) {
      return alert0.call(window, t(String(msg)));
    };
    window.confirm = function (msg) {
      return confirm0.call(window, t(String(msg)));
    };
    window.prompt = function (msg, def) {
      return prompt0.call(window, t(String(msg)), def);
    };
  }

  function setLang(l) {
    try {
      localStorage.setItem('lang', l === 'vi' ? 'vi' : 'en');
    } catch (e) {
      // Storage blocked: the choice can't be kept.
    }
  }

  window.I18n = {
    lang: lang,
    t: t,
    dayTitle: dayTitle,
    setLang: setLang
  };
  // Loaded at the end of <body>, before app.js draws the first screen.
  start();
})();
