const M: Record<string, string> = {
  not_authenticated: 'يجب تسجيل الدخول أولاً', forbidden: 'ليست لديك صلاحية لهذا الإجراء', account_inactive: 'الحساب موقوف، تواصل مع الدعم',
  invalid_credentials: 'البريد أو كلمة المرور غير صحيحة', email_exists: 'هذا البريد مسجّل مسبقاً', email_not_confirmed: 'فعّل بريدك من الرسالة المرسلة إليك أولاً',
  weak_password: 'كلمة المرور ضعيفة (8 أحرف على الأقل)', invalid_email: 'البريد الإلكتروني غير صالح', invalid_name: 'الاسم قصير جداً',
  invalid_slug: 'الرابط يجب أن يكون 3–40 حرفاً: أحرف إنجليزية صغيرة وأرقام وشرطات', slug_reserved: 'هذا الرابط محجوز، اختر غيره', slug_taken: 'هذا الرابط مستخدم، اختر غيره',
  'limit_reached:stores': 'وصلت للحد الأقصى من المتاجر في باقتك', 'limit_reached:custom_pages': 'وصلت للحد الأقصى من الصفحات المخصصة، رقّ باقتك',
  'limit_reached:seats': 'وصلت للحد الأقصى من أعضاء الفريق', 'limit_reached:domains': 'وصلت للحد الأقصى من النطاقات', 'limit_reached:media_mb': 'مساحة الوسائط ممتلئة',
  draft_conflict: 'تم تعديل المتجر من مكان آخر. أعد تحميل الصفحة للمتابعة.', store_locked: 'المتجر موقوف أو مؤرشف', not_found: 'العنصر غير موجود', template_not_found: 'القالب غير متاح',
  invalid_domain: 'اسم النطاق غير صالح', domain_taken: 'النطاق مستخدم في متجر آخر', domain_not_verified: 'يجب توثيق النطاق أولاً', cannot_remove_subdomain: 'لا يمكن حذف النطاق الفرعي',
  invalid_role: 'الدور غير صالح', file_too_large: 'حجم الملف كبير', invalid_file: 'نوع الملف غير مدعوم', draft_too_large: 'حجم التصميم كبير جداً', forbidden_page_type: 'لا يمكن إنشاء هذا النوع من الصفحات',
  'plan_limit_exceeded:seats': 'لا يمكن التخفيض: عدد الأعضاء أكبر من حد الباقة', 'plan_limit_exceeded:domains': 'لا يمكن التخفيض: عدد النطاقات أكبر من حد الباقة', 'plan_limit_exceeded:custom_pages': 'لا يمكن التخفيض: الصفحات المخصصة أكثر من حد الباقة',
  not_published: 'لم يُنشر المتجر بعد', invalid_url: 'الرابط غير صالح', invalid_draft: 'بيانات التصميم غير صالحة', id_conflict: 'تعارض في معرّفات الصفحات',
};
export function errText(e: unknown): string {
  const m = String((e as any)?.message ?? e ?? '');
  if (M[m]) return M[m];
  if (m.startsWith('not_ready')) return 'المتجر غير جاهز للنشر: صفحات مفقودة (' + m.split(':')[1] + ')';
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'تعذّر الاتصال بالخادم، تحقق من الإنترنت';
  return 'حدث خطأ غير متوقع' + (m && m.length < 80 ? ` (${m})` : '');
}
