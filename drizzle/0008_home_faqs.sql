-- Add safe launch FAQs to existing stores without overwriting admin content.
INSERT INTO faqs (id, is_published, sort_order)
VALUES
  ('0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa01', 1, 1),
  ('0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa02', 1, 2),
  ('0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa03', 1, 3),
  ('0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa04', 1, 4)
ON CONFLICT(id) DO NOTHING;
--> statement-breakpoint
INSERT INTO faq_translations (id, faq_id, locale, question, answer)
VALUES
  ('0c40d700-4e76-4c9e-8b98-3fbbb6f0aa01', '0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa01', 'en', 'How is my child added to a story?', 'Choose a story and enter the requested details. Personalized stories may ask for the child’s name, story language, and clear photos before checkout.'),
  ('0c40d700-4e76-4c9e-8b98-3fbbb6f0aa02', '0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa01', 'ar', 'كيف تتم إضافة طفلي إلى القصة؟', 'اختر القصة وأدخل البيانات المطلوبة. قد تطلب القصص المخصصة اسم الطفل ولغة القصة وصورًا واضحة قبل إتمام الطلب.'),
  ('0c40d700-4e76-4c9e-8b98-3fbbb6f0aa03', '0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa02', 'en', 'How can I track my order?', 'Open Track order and enter the order number and the phone number used at checkout. You can also create an account after ordering to keep verified orders together.'),
  ('0c40d700-4e76-4c9e-8b98-3fbbb6f0aa04', '0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa02', 'ar', 'كيف أتابع طلبي؟', 'افتح صفحة تتبع الطلب وأدخل رقم الطلب ورقم الهاتف المستخدم عند الشراء. ويمكنك أيضًا إنشاء حساب بعد الطلب للاحتفاظ بطلباتك الموثقة في مكان واحد.'),
  ('0c40d700-4e76-4c9e-8b98-3fbbb6f0aa05', '0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa03', 'en', 'Which payment methods are available?', 'Checkout shows the payment methods currently available for your order, including cash on delivery or supported manual transfers where eligible.'),
  ('0c40d700-4e76-4c9e-8b98-3fbbb6f0aa06', '0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa03', 'ar', 'ما طرق الدفع المتاحة؟', 'تعرض صفحة إتمام الطلب طرق الدفع المتاحة لطلبك، ومنها الدفع عند الاستلام أو التحويل اليدوي المدعوم عند توفره.'),
  ('0c40d700-4e76-4c9e-8b98-3fbbb6f0aa07', '0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa04', 'en', 'When can I leave a review?', 'You can rate your experience after the order is marked delivered. Open the order from your account or track it with your order number and phone.'),
  ('0c40d700-4e76-4c9e-8b98-3fbbb6f0aa08', '0c40d6f0-4e76-4c9e-8b98-3fbbb6f0aa04', 'ar', 'متى يمكنني إضافة تقييم؟', 'يمكنك تقييم تجربتك بعد تسجيل الطلب كمُسلَّم. افتح الطلب من حسابك أو تتبعه باستخدام رقم الطلب ورقم الهاتف.')
ON CONFLICT(faq_id, locale) DO NOTHING;
