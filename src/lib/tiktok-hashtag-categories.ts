// Ocushield marketing hashtag categories (Sept 2026) — the single shared
// source of truth for both the daily-sync cron's rotation
// (weekly-sync-run.ts, which searches a rotating daily slice of these) and
// Search by Hashtag's preset picker (weekly-hashtag-search/page.tsx, which
// lets a person pick straight from this list instead of typing one from
// scratch). One flat list per category for readability/maintenance; the
// same tag intentionally appears in more than one category.
export const HASHTAG_CATEGORIES: Record<string, string[]> = {
  "Brand-wide": [
    "Ocushield", "EyeHealth", "DigitalWellness", "SleepHealth", "HealthyScreenTime",
    "WellnessTechnology", "HealthTech", "EverydayWellness", "ScreenTime", "HealthyHabits",
    "EyeCare", "BetterSleep", "WellnessRoutine", "Biohacking",
  ],
  "Medical and expert credibility": [
    "OptometristDeveloped", "MedicallyRegistered", "MedicallyRated", "EyeCareExpert",
    "EyeHealthEducation", "EvidenceBasedWellness", "WellnessScience", "ExpertExplains",
    "HealthEducation", "MythVsFact",
  ],
  "Blue-light glasses": [
    "BlueLightGlasses", "ComputerGlasses", "DigitalEyeStrain", "EyeStrainRelief", "TiredEyes",
    "ScreenFatigue", "ScreenWorker", "MigraineRelief", "HeadacheRelief", "LightSensitivity",
    "LongWorkday", "StudentWellness", "OfficeWellness", "EveningRoutine", "BetterSleep",
    "CircadianRhythm", "StylishEyewear", "WorkdayWellness", "WorkFromHomeEssentials", "Ocushield",
  ],
  "iPhone screen protectors": [
    "BlueLightFilter", "ScreenProtector", "iPhoneScreenProtector", "iPhoneAccessories",
    "iPhoneTips", "NewPhoneSetup", "PhoneProtection", "TemperedGlass", "ProtectYourPhone",
    "DigitalEyeStrain", "TiredEyes", "ScreenTime", "HealthyScreenTime", "NighttimeScrolling",
    "PhoneBeforeBed", "BedtimeRoutine", "BetterSleep", "PrivacyScreen", "PhonePrivacy",
    "PrivacyProtector", "DigitalPrivacy", "BlueLightSkincare", "ScreenSkin", "BeautyTech", "Ocushield",
  ],
  "iPad screen filters": [
    "iPadTips", "iPadAccessories", "TabletAccessories", "DigitalReading", "TabletReader",
    "ReadingInBed", "BedtimeReading", "HealthyAging", "EyeHealthOver50", "SeniorWellness",
    "MatureWellness", "TiredEyes", "DryEyes", "DigitalEyeStrain", "HealthyScreenTime",
    "FamilyScreenTime", "Grandparents", "KidsScreenTime", "Ocushield",
  ],
  "Laptop and MacBook filters": [
    "DigitalEyeStrain", "ScreenFatigue", "RemoteWorker", "RemoteWork", "HybridWork",
    "WorkFromHome", "WorkFromHomeHealth", "HomeOfficeEssentials", "DeskSetup", "WorkspaceSetup",
    "LaptopAccessories", "MacBookAccessories", "MacBookTips", "WorkdayWellness", "FullShift",
    "LongWorkday", "WorkplaceHealth", "EmployeeWellbeing", "OccupationalHealth", "MigraineAtWork",
    "ProductivityTips", "BlueLightSkincare", "ScreenSkin", "MelasmaCare", "Hyperpigmentation", "Ocushield",
  ],
  "Monitor and desktop filters": [
    "MonitorSetup", "DesktopSetup", "OfficeSetup", "OfficeEyeStrain", "DigitalEyeStrain",
    "ScreenFatigue", "LongWorkday", "WorkplaceWellness", "OfficeWellness", "EmployeeWellbeing",
    "OccupationalHealth", "HealthyWorkplace", "PrivacyScreen", "ScreenPrivacy", "OfficePrivacy",
    "DeskPrivacy", "VisualHacking", "DataPrivacy", "WorkplaceSecurity", "ClientConfidentiality",
    "OpenOffice", "HybridWork", "Ocushield",
  ],
  "Weighted sleep mask": [
    "SleepMask", "WeightedEyeMask", "BetterSleep", "SleepRoutine", "BedtimeRoutine",
    "NightRoutine", "SleepTok", "SleepTips", "SleepHacks", "SleepMaxxing", "DeepSleep",
    "BlackoutSleep", "NightShiftLife", "DaytimeSleep", "TravelEssentials", "TravelWellness",
    "MigraineRoutine", "LightSensitivity", "SelfCareRoutine", "Ocushield",
  ],
  "Red-light therapy and Ocuglow": [
    "RedLightTherapy", "RedLightMask", "LEDMask", "LEDLightTherapy", "BeautyTech",
    "AtHomeSkincare", "SkincareRoutine", "NighttimeSkincare", "RedLightSkincare", "GlowingSkin",
    "SkinRejuvenation", "MatureSkin", "SkinAgeing", "FineLines", "SkinTone", "AgeWell",
    "BeautyOver40", "SkincareOver40", "WellnessRoutine", "EveningWellness", "RedLightScience",
    "SkincareScience", "EvidenceBasedSkincare", "Ocuglow",
  ],
  "Heated eye masks and dry-eye products": [
    "DryEyeRelief", "DryEyeRoutine", "DryEyeAwareness", "HeatedEyeMask", "WarmEyeCompress",
    "EyeCompress", "EyeCareRoutine", "TiredEyes", "ScreenRecovery", "EyeWellness",
    "EveningRoutine", "SelfCareRoutine", "Ocushield",
  ],
  "Ocubulb and Oculamp": [
    "SleepLighting", "LowBlueLight", "BlueLightFree", "CircadianRhythm", "HealthyLighting",
    "EveningRoutine", "WindDownRoutine", "BedtimeRoutine", "SleepEnvironment", "SleepHygiene",
    "BedroomLighting", "AmbientLighting", "CalmLighting", "RelaxingHome", "SleepFriendlyHome",
    "HomeWellness", "MigraineFriendlyHome", "LightSensitivity", "ReadingAtNight", "Ocushield",
  ],
  "EMF protection": [
    "EMFProtection", "EMFAwareness", "PhoneRadiation", "DigitalWellness", "HealthyTechnology",
    "TechWellness", "SaferTechnology", "PhoneSafety", "HealthyHome", "FamilyWellness",
    "WellnessTechnology", "EverydayProtection", "ScreenTime", "Ocushield",
  ],
  "Children and family": [
    "HealthyScreenTime", "KidsScreenTime", "KidsEyeHealth", "DigitalParenting", "ParentingTips",
    "HealthyScreenHabits", "FamilyWellness", "FamilyScreenTime", "OnlineLearning",
    "HomeworkSetup", "SchoolEssentials", "ParentingHacks", "TechHealthyFamily", "Ocushield",
  ],
  "B2B and workplace wellness": [
    "WorkplaceWellness", "EmployeeWellbeing", "EmployeeHealth", "OfficeWellness",
    "CorporateWellness", "HealthyWorkplace", "WorkplaceHealth", "OccupationalHealth",
    "FutureOfWork", "HybridWork", "RemoteWork", "PeopleAndCulture", "HRLeadership",
    "WorkplaceSecurity", "OfficePrivacy", "Ocushield",
  ],
};

export function uniqueHashtags(): string[] {
  const seen = new Set<string>();
  for (const tags of Object.values(HASHTAG_CATEGORIES)) {
    for (const tag of tags) seen.add(tag.toLowerCase());
  }
  return Array.from(seen);
}
