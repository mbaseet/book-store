-- Bootstrap-only initial data for Egypt-only delivery. Amounts are piastres;
-- 8500 represents EGP 85.00. Re-running this file must never overwrite
-- business edits made through the admin area.
INSERT INTO governorates (id, code, name_en, name_ar, shipping_fee_amount, is_active, sort_order)
VALUES
  ('gov-alexandria', 'alexandria', 'Alexandria', 'الإسكندرية', 8500, 1, 2),
  ('gov-aswan', 'aswan', 'Aswan', 'أسوان', 8500, 1, 20),
  ('gov-asyut', 'asyut', 'Asyut', 'أسيوط', 8500, 1, 19),
  ('gov-beheira', 'beheira', 'Beheira', 'البحيرة', 8500, 1, 3),
  ('gov-beni-suef', 'beni-suef', 'Beni Suef', 'بني سويف', 8500, 1, 15),
  ('gov-cairo', 'cairo', 'Cairo', 'القاهرة', 8500, 1, 1),
  ('gov-dakahlia', 'dakahlia', 'Dakahlia', 'الدقهلية', 8500, 1, 4),
  ('gov-damietta', 'damietta', 'Damietta', 'دمياط', 8500, 1, 9),
  ('gov-faiyum', 'faiyum', 'Faiyum', 'الفيوم', 8500, 1, 16),
  ('gov-gharbia', 'gharbia', 'Gharbia', 'الغربية', 8500, 1, 6),
  ('gov-giza', 'giza', 'Giza', 'الجيزة', 8500, 1, 5),
  ('gov-ismailia', 'ismailia', 'Ismailia', 'الإسماعيلية', 8500, 1, 11),
  ('gov-kafr-el-sheikh', 'kafr-el-sheikh', 'Kafr El Sheikh', 'كفر الشيخ', 8500, 1, 8),
  ('gov-luxor', 'luxor', 'Luxor', 'الأقصر', 8500, 1, 21),
  ('gov-matrouh', 'matrouh', 'Matrouh', 'مطروح', 8500, 1, 24),
  ('gov-minya', 'minya', 'Minya', 'المنيا', 8500, 1, 17),
  ('gov-monufia', 'monufia', 'Monufia', 'المنوفية', 8500, 1, 7),
  ('gov-new-valley', 'new-valley', 'New Valley', 'الوادي الجديد', 8500, 1, 27),
  ('gov-north-sinai', 'north-sinai', 'North Sinai', 'شمال سيناء', 8500, 1, 25),
  ('gov-port-said', 'port-said', 'Port Said', 'بورسعيد', 8500, 1, 10),
  ('gov-qalyubia', 'qalyubia', 'Qalyubia', 'القليوبية', 8500, 1, 10),
  ('gov-qena', 'qena', 'Qena', 'قنا', 8500, 1, 22),
  ('gov-red-sea', 'red-sea', 'Red Sea', 'البحر الأحمر', 8500, 1, 23),
  ('gov-sharqia', 'sharqia', 'Sharqia', 'الشرقية', 8500, 1, 5),
  ('gov-sohag', 'sohag', 'Sohag', 'سوهاج', 8500, 1, 18),
  ('gov-south-sinai', 'south-sinai', 'South Sinai', 'جنوب سيناء', 8500, 1, 26),
  ('gov-suez', 'suez', 'Suez', 'السويس', 8500, 1, 12)
ON CONFLICT(code) DO NOTHING;

-- Initial storefront collections supplied by the business. Stories can be
-- assigned to these through the admin catalog once they are ready.
INSERT INTO categories (id, slug, is_featured, sort_order, image_url, cloudinary_public_id)
VALUES
  ('0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa01', 'hero-worlds', 1, 1, NULL, NULL),
  ('0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa02', 'discover-the-world', 1, 2, NULL, NULL),
  ('0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa03', 'character-building', 1, 3, NULL, NULL),
  ('0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa04', 'feelings-and-life', 1, 4, NULL, NULL),
  ('0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa05', 'islamic-stories', 1, 5, NULL, NULL),
  ('0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa06', 'special-moments', 1, 6, NULL, NULL)
ON CONFLICT(slug) DO NOTHING;

INSERT INTO category_translations (id, category_id, locale, name, description)
VALUES
  ('0c40d6b0-4e76-4c9e-8b98-3fbbb6f0aa01', '0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa01', 'ar', 'عوالم الأبطال', 'مغامرات شجاعة يكون فيها طفلك بطل الحكاية.'),
  ('0c40d6b0-4e76-4c9e-8b98-3fbbb6f0aa02', '0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa01', 'en', 'Hero Worlds', 'Brave adventures where your child leads the story.'),
  ('0c40d6b0-4e76-4c9e-8b98-3fbbb6f0aa03', '0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa02', 'ar', 'اكتشف العالم', 'رحلات فضولية بين الأماكن والطبيعة والأفكار الجديدة.'),
  ('0c40d6b0-4e76-4c9e-8b98-3fbbb6f0aa04', '0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa02', 'en', 'Discover the World', 'Curious journeys through places, nature, and new ideas.'),
  ('0c40d6b0-4e76-4c9e-8b98-3fbbb6f0aa05', '0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa03', 'ar', 'تنمية الشخصية', 'حكايات عن الثقة واللطف والنمو في المواقف اليومية.'),
  ('0c40d6b0-4e76-4c9e-8b98-3fbbb6f0aa06', '0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa03', 'en', 'Character Building', 'Stories about confidence, kindness, and everyday growth.'),
  ('0c40d6b0-4e76-4c9e-8b98-3fbbb6f0aa07', '0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa04', 'ar', 'مشاعري وحياتي', 'قصص لطيفة تساعد الأطفال على فهم مشاعرهم وتجاربهم.'),
  ('0c40d6b0-4e76-4c9e-8b98-3fbbb6f0aa08', '0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa04', 'en', 'Feelings & Life', 'Gentle stories that help children explore feelings and everyday life.'),
  ('0c40d6b0-4e76-4c9e-8b98-3fbbb6f0aa09', '0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa05', 'ar', 'قصص إسلامية', 'حكايات دافئة مستلهمة من القيم الإسلامية.'),
  ('0c40d6b0-4e76-4c9e-8b98-3fbbb6f0aa10', '0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa05', 'en', 'Islamic Stories', 'Warm stories inspired by Islamic values.'),
  ('0c40d6b0-4e76-4c9e-8b98-3fbbb6f0aa11', '0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa06', 'ar', 'لحظات لا تنسى', 'هدايا تذكارية لأعياد الميلاد والاحتفالات والذكريات.'),
  ('0c40d6b0-4e76-4c9e-8b98-3fbbb6f0aa12', '0c40d6a0-4e76-4c9e-8b98-3fbbb6f0aa06', 'en', 'Special Moments', 'Keepsakes for birthdays, celebrations, and memories.')
ON CONFLICT(category_id, locale) DO NOTHING;

-- Confirmed launch payment rails. The generic mobile-wallet option accepts
-- transfers from Vodafone Cash, Orange Money, WE Pay, and Etisalat Cash.
INSERT INTO site_settings (id, key, value, is_public)
VALUES
  ('0c40d6e0-4e76-4c9e-8b98-3fbbb6f0aa01', 'payment_details', '{"instapay":"InstaPay\nPhone: 01010851818\nPayment link: https://ipn.eg/S/m201010851818/instapay/7Mw0Pk\nUsername: m201010851818@instapay","mobileWallet":"Mobile wallet / محفظة إلكترونية\nVodafone Cash, Orange Money, WE Pay, or Etisalat Cash\nPhone: 01010851818"}', 1)
ON CONFLICT(key) DO NOTHING;

-- Editable launch drafts. Replace the bracketed business details and obtain a
-- local legal review before publishing a production storefront.
INSERT INTO content_pages (id, key, is_published)
VALUES
  ('0c40d6c0-4e76-4c9e-8b98-3fbbb6f0aa01', 'terms', 1),
  ('0c40d6c0-4e76-4c9e-8b98-3fbbb6f0aa02', 'returns', 1),
  ('0c40d6c0-4e76-4c9e-8b98-3fbbb6f0aa03', 'privacy', 1)
ON CONFLICT(key) DO NOTHING;

INSERT INTO content_page_translations (id, content_page_id, locale, title, content)
SELECT
  '0c40d6d0-4e76-4c9e-8b98-3fbbb6f0aa01',
  id,
  'en',
  'Terms of Sale',
  'Effective date: [add date before publishing]

This is the sales-policy draft for [Brand Name]. Replace the bracketed contact and business details before launch.

1. Our made-to-order stories
Each book is made after you provide personalization details such as a child name, story language, optional note, and one or two child photos. The story-language choice is a production instruction and does not change the listed price or preview.

2. Your information and permissions
You are responsible for checking the spelling and accuracy of the personalization details before you submit an order. By uploading a photo or other material, you confirm that you are the child’s parent or legal guardian, or otherwise have permission to provide it for this order. Do not upload unlawful, harmful, or material that infringes another person’s rights.

3. Prices, delivery, and promotions
All displayed prices are in EGP and include VAT. Delivery fees vary by governorate and are shown in the checkout total. A single fixed-value promo code may be used per order when eligible; it may combine with a story sale price. Free shipping, if enabled, is calculated after the promo discount. The final amount is calculated by our server and shown before you transfer.

4. Manual payment and order acceptance
This store does not use a payment gateway in phase 1. You transfer the displayed final amount using the available manual payment details shown at checkout, then upload a payment screenshot. A payment screenshot is not by itself payment confirmation. We review the proof before production begins, and we may contact you if a payment or order detail needs clarification.

5. Order updates
The site shows order status updates only. Production and delivery operations are handled outside the site, and no courier tracking is provided in phase 1.

6. Consumer rights and contact
Nothing in these terms removes rights that cannot legally be limited. For help with an order, contact [support email] or [WhatsApp link] and include your order number.

7. Changes to these terms
We may update this page for future orders. The version displayed when you submit an order applies to that order, subject to applicable law.'
FROM content_pages
WHERE key = 'terms'
ON CONFLICT(content_page_id, locale) DO NOTHING;

INSERT INTO content_page_translations (id, content_page_id, locale, title, content)
SELECT
  '0c40d6d0-4e76-4c9e-8b98-3fbbb6f0aa02',
  id,
  'ar',
  'شروط البيع',
  'تاريخ السريان: [أضف التاريخ قبل النشر]

هذه مسودة شروط البيع الخاصة بـ[اسم العلامة]. استبدل بيانات التواصل وبيانات النشاط الموجودة بين الأقواس قبل الإطلاق.

1. قصص تُصنع حسب الطلب
يُصنع كل كتاب بعد تقديم تفاصيل التخصيص مثل اسم الطفل ولغة القصة والملاحظة الاختيارية وصورة واحدة أو صورتين للطفل. اختيار لغة القصة هو توجيه للتجهيز ولا يغيّر السعر المعلن أو المعاينة.

2. صحة البيانات والصلاحية
أنت مسؤول عن مراجعة كتابة الاسم وصحة تفاصيل التخصيص قبل إرسال الطلب. برفع أي صورة أو مادة، تؤكد أنك ولي أمر الطفل أو الوصي القانوني عليه، أو لديك تصريح آخر لتقديمها لهذا الطلب. لا ترفع محتوى غير قانوني أو ضار أو ينتهك حقوق الغير.

3. الأسعار والشحن وأكواد الخصم
كل الأسعار المعروضة بالجنيه المصري وتشمل ضريبة القيمة المضافة. تختلف رسوم التوصيل حسب المحافظة وتظهر في إجمالي الطلب. يمكن استخدام كود خصم ثابت واحد لكل طلب عند استيفاء الشروط، ويمكن أن يجتمع مع سعر العرض على القصة. يُحسب الشحن المجاني، عند تفعيله، بعد خصم الكود. يحسب خادم المتجر المبلغ النهائي ويعرضه قبل التحويل.

4. الدفع اليدوي وقبول الطلب
لا يستخدم المتجر بوابة دفع في المرحلة الأولى. حوّل المبلغ النهائي الظاهر باستخدام بيانات الدفع اليدوي المتاحة المعروضة عند إتمام الطلب، ثم ارفع لقطة شاشة للتحويل. لا تُعد لقطة الشاشة وحدها تأكيدًا للدفع. نراجع الإثبات قبل بدء التجهيز، وقد نتواصل معك إذا احتاج الدفع أو الطلب إلى توضيح.

5. تحديثات الطلب
يعرض الموقع تحديثات حالة الطلب فقط. تتم عمليات الإنتاج والتوصيل خارج الموقع، ولا يتوفر تتبع لشركة الشحن في المرحلة الأولى.

6. حقوق المستهلك والتواصل
لا تؤدي هذه الشروط إلى إلغاء أي حق لا يجوز تقييده قانونًا. للمساعدة في أي طلب، تواصل عبر [بريد الدعم] أو [رابط واتساب] مع ذكر رقم الطلب.

7. تعديل الشروط
قد نحدّث هذه الصفحة للطلبات المستقبلية. تسري النسخة المعروضة عند إرسال الطلب على ذلك الطلب، مع مراعاة القانون الواجب التطبيق.'
FROM content_pages
WHERE key = 'terms'
ON CONFLICT(content_page_id, locale) DO NOTHING;

INSERT INTO content_page_translations (id, content_page_id, locale, title, content)
SELECT
  '0c40d6d0-4e76-4c9e-8b98-3fbbb6f0aa03',
  id,
  'en',
  'Returns & Cancellations',
  'Effective date: [add date before publishing]

This is an editable launch draft for [Brand Name]. It does not limit mandatory rights under Egyptian law.

1. Before production
If you need to correct or cancel an order, contact us immediately through [support email] or [WhatsApp link] with the order number. We will tell you whether the requested change is still possible based on the order stage.

2. Made-to-order books
Every book is created from customer-supplied specifications, including the child name and photos. Where the book matches those agreed specifications, the no-reason return right may not apply to a made-to-order product or book, to the extent permitted by Egyptian law. This does not affect rights for a defective, damaged, or non-conforming product.

3. Defective, damaged, or incorrect items
If your book arrives damaged, has a printing defect, or does not match the confirmed order details, contact us as soon as possible with your order number and clear photos. We will assess the issue and provide the remedy required by law and appropriate to the situation, which may include a correction, reprint, replacement, or refund. Consumer rights for defective goods, including rights that may apply during the statutory 30-day period after delivery, remain unaffected.

4. Refund method and shipping costs
Where a refund is due, it will be handled through the appropriate available method after the case is reviewed. Any treatment of delivery charges will follow applicable law and the circumstances of the order.

5. How to contact us
Use [support email] or [WhatsApp link]. Please keep your order number and payment record until the issue is resolved.'
FROM content_pages
WHERE key = 'returns'
ON CONFLICT(content_page_id, locale) DO NOTHING;

INSERT INTO content_page_translations (id, content_page_id, locale, title, content)
SELECT
  '0c40d6d0-4e76-4c9e-8b98-3fbbb6f0aa04',
  id,
  'ar',
  'الاستبدال والاسترجاع والإلغاء',
  'تاريخ السريان: [أضف التاريخ قبل النشر]

هذه مسودة قابلة للتعديل الخاصة بـ[اسم العلامة]. لا تقيد هذه الصفحة أي حقوق إلزامية مقررة بموجب القانون المصري.

1. قبل بدء التجهيز
إذا احتجت إلى تعديل الطلب أو إلغائه، تواصل معنا فورًا عبر [بريد الدعم] أو [رابط واتساب] مع رقم الطلب. سنوضح لك ما إذا كان التعديل ما زال ممكنًا بحسب مرحلة الطلب.

2. الكتب المصنوعة حسب الطلب
يُصنع كل كتاب وفق مواصفات يقدمها العميل، ومنها اسم الطفل وصوره. إذا كان الكتاب مطابقًا لهذه المواصفات المتفق عليها، فقد لا يسري حق الرد دون إبداء سبب على المنتج أو الكتاب المصنوع وفق مواصفات خاصة، في الحدود التي يجيزها القانون المصري. ولا يمس ذلك حق العميل في المنتج المعيب أو التالف أو غير المطابق.

3. المنتج المعيب أو التالف أو غير الصحيح
إذا وصل الكتاب تالفًا أو به عيب في الطباعة أو لا يطابق تفاصيل الطلب المؤكدة، تواصل معنا في أقرب وقت ممكن مع رقم الطلب وصور واضحة. سنراجع الحالة ونوفر الحل الذي يوجبه القانون ويناسب الحالة، وقد يشمل التصحيح أو إعادة الطباعة أو الاستبدال أو رد المبلغ. تظل حقوق المستهلك المتعلقة بالسلع المعيبة، بما في ذلك الحقوق التي قد تسري خلال مدة الثلاثين يومًا القانونية من التسليم، محفوظة.

4. طريقة رد المبلغ ورسوم الشحن
عند استحقاق رد مبلغ، يتم التعامل معه بالطريقة المناسبة المتاحة بعد مراجعة الحالة. ويخضع التعامل مع رسوم التوصيل للقانون الواجب التطبيق وظروف الطلب.

5. التواصل معنا
استخدم [بريد الدعم] أو [رابط واتساب]. احتفظ برقم الطلب وسجل الدفع حتى حل المشكلة.'
FROM content_pages
WHERE key = 'returns'
ON CONFLICT(content_page_id, locale) DO NOTHING;

INSERT INTO content_page_translations (id, content_page_id, locale, title, content)
SELECT
  '0c40d6d0-4e76-4c9e-8b98-3fbbb6f0aa05',
  id,
  'en',
  'Privacy Policy',
  'Effective date: [add date before publishing]

This is an editable launch draft for [Brand Name]. Complete the business identity and contact details before publishing, and obtain local legal review.

1. Information we collect
To process an order, we collect contact and delivery information, the story personalization details, child name, one or two child photos, an optional note, the selected payment method, payment proof, and order-status history. We may also keep account details if you voluntarily create an account to view past orders.

2. Why we use it
We use this information only to provide customer support, calculate and review the order, verify manual payment, prepare the personalized book, arrange delivery, and meet legal or accounting obligations. We do not sell, rent, or publicly display child photos or payment proofs.

3. Children and uploaded photos
A parent or legal guardian must provide, or authorize the provision of, a child’s information and image. Please upload only what is necessary for the book. Child photos are not public and are kept in restricted authenticated storage.

4. Retention and deletion
Before an order is submitted, we may temporarily save the story personalization, child photos, and delivery details in an encrypted checkout draft associated with this browser for up to 60 minutes so you can resume after a refresh. The draft expires automatically. A payment screenshot is not automatically saved as a draft. For submitted orders, child photos and payment proofs are scheduled for deletion 30 days after the order is delivered or cancelled. Some non-sensitive order, payment, and account records may need to be retained longer where required by law, accounting, dispute handling, or security needs. Do not rely on this site as your only copy of any image.

5. Service providers and security
We use technical service providers needed to host the store, store private images, and send customer messages. They process data only as needed to provide those services. We use reasonable technical and organizational safeguards, but no online system can promise absolute security.

6. Your requests and questions
For access, correction, deletion, or privacy questions, contact [privacy email]. We may need to verify your identity and may retain information where the law permits or requires it.

7. Updates
We may revise this policy as the service changes. The latest version will be published on this page.'
FROM content_pages
WHERE key = 'privacy'
ON CONFLICT(content_page_id, locale) DO NOTHING;

INSERT INTO content_page_translations (id, content_page_id, locale, title, content)
SELECT
  '0c40d6d0-4e76-4c9e-8b98-3fbbb6f0aa06',
  id,
  'ar',
  'سياسة الخصوصية',
  'تاريخ السريان: [أضف التاريخ قبل النشر]

هذه مسودة قابلة للتعديل الخاصة بـ[اسم العلامة]. أكمل هوية النشاط وبيانات التواصل قبل النشر، وراجعها قانونيًا محليًا.

1. البيانات التي نجمعها
لمعالجة الطلب نجمع بيانات التواصل والتوصيل، وتفاصيل تخصيص القصة، واسم الطفل، وصورة واحدة أو صورتين للطفل، والملاحظة الاختيارية، وطريقة الدفع المختارة، وإثبات الدفع، وسجل حالات الطلب. وقد نحتفظ ببيانات الحساب إذا أنشأت حسابًا باختيارك لمشاهدة الطلبات السابقة.

2. سبب استخدام البيانات
نستخدم هذه البيانات فقط لخدمة العملاء، وحساب الطلب ومراجعته، والتحقق من الدفع اليدوي، وتجهيز الكتاب المخصص، وترتيب التوصيل، والوفاء بالالتزامات القانونية أو المحاسبية. لا نبيع أو نؤجر أو نعرض علنًا صور الأطفال أو إثباتات الدفع.

3. الأطفال والصور المرفوعة
يجب أن يقدم ولي الأمر أو الوصي القانوني بيانات الطفل وصورته، أو أن يصرح بتقديمها. ارفع فقط ما يلزم لتجهيز الكتاب. لا تكون صور الأطفال عامة، وتُحفظ في مساحة تخزين موثقة ومقيدة الوصول.

4. الاحتفاظ والحذف
قبل إرسال الطلب، قد نحفظ مؤقتًا تفاصيل تخصيص القصة وصور الطفل وبيانات التوصيل في مسودة دفع مشفّرة مرتبطة بهذا المتصفح لمدة لا تتجاوز 60 دقيقة لتتمكن من المتابعة بعد تحديث الصفحة. تنتهي المسودة تلقائيًا. ولا تُحفظ لقطة شاشة الدفع تلقائيًا ضمن المسودة. أما الطلبات المُرسلة، فتُجدول صور الأطفال وإثباتات الدفع للحذف بعد 30 يومًا من تسليم الطلب أو إلغائه. وقد نحتاج إلى الاحتفاظ لمدة أطول ببعض سجلات الطلب أو الدفع أو الحساب غير الحساسة عندما يقتضي ذلك القانون أو المحاسبة أو معالجة النزاعات أو متطلبات الأمان. لا تعتمد على الموقع كنسختك الوحيدة من أي صورة.

5. مزودو الخدمة والأمان
نستخدم مزودي خدمات تقنية لازمين لاستضافة المتجر وتخزين الصور الخاصة وإرسال رسائل العملاء. يعالجون البيانات بالقدر اللازم لتقديم هذه الخدمات. نستخدم إجراءات تقنية وتنظيمية معقولة للحماية، لكن لا يمكن لأي نظام عبر الإنترنت ضمان أمان مطلق.

6. طلباتك واستفساراتك
للوصول إلى بياناتك أو تصحيحها أو حذفها أو لأسئلة الخصوصية، تواصل عبر [بريد الخصوصية]. قد نحتاج إلى التحقق من هويتك، وقد نحتفظ ببعض البيانات عندما يسمح القانون بذلك أو يوجبه.

7. التحديثات
قد نعدّل هذه السياسة مع تطور الخدمة. تُنشر أحدث نسخة على هذه الصفحة.'
FROM content_pages
WHERE key = 'privacy'
ON CONFLICT(content_page_id, locale) DO NOTHING;
