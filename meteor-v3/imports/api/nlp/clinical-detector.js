import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';

export class ClinicalDetector {
  constructor() {
    this.clinicalKeywords = get(Meteor.settings, 'private.nlp.clinicalKeywords', [
      'sick', 'pain', 'doctor', 'hospital', 'medication', 'surgery',
      'headache', 'fever', 'tired', 'appointment', 'diagnosis', 'treatment',
      'prescription', 'symptoms', 'illness', 'injury', 'therapy', 'recovery',
      'ache', 'hurt', 'sore', 'pharmacy', 'clinic', 'emergency', 'urgent care',
      'checkup', 'blood test', 'x-ray', 'scan', 'mri', 'ct', 'ultrasound',
      'vaccination', 'vaccine', 'shot', 'immunization', 'allergy', 'allergic',
      'rash', 'swelling', 'bruise', 'cut', 'wound', 'bleeding', 'nausea',
      'vomiting', 'diarrhea', 'constipation', 'heartburn', 'indigestion',
      'dizzy', 'fainting', 'chest pain', 'shortness of breath', 'cough',
      'cold', 'flu', 'covid', 'coronavirus', 'quarantine', 'isolation',
      'mental health', 'depression', 'anxiety', 'stress', 'counseling',
      'therapist', 'psychiatrist', 'psychologist', 'medicine', 'pills',
      'tablet', 'capsule', 'dose', 'dosage', 'side effect', 'reaction'
    ]);

    // SNOMED CT mappings for common terms
    this.snomedMappings = {
      'headache': { code: '25064002', display: 'Headache' },
      'fever': { code: '386661006', display: 'Fever' },
      'pain': { code: '22253000', display: 'Pain' },
      'cough': { code: '49727002', display: 'Cough' },
      'nausea': { code: '422587007', display: 'Nausea' },
      'tired': { code: '84229001', display: 'Fatigue' },
      'anxiety': { code: '48694002', display: 'Anxiety' },
      'depression': { code: '35489007', display: 'Depressive disorder' },
      'surgery': { code: '387713003', display: 'Surgical procedure' },
      'medication': { code: '410942007', display: 'Drug or medicament' }
    };

    // Severity indicators
    this.severityIndicators = {
      high: ['severe', 'terrible', 'excruciating', 'unbearable', 'worst', 'emergency', 'urgent'],
      medium: ['bad', 'moderate', 'uncomfortable', 'concerning', 'worrying'],
      low: ['mild', 'slight', 'minor', 'little', 'small']
    };

    // Temporal indicators
    this.temporalIndicators = {
      acute: ['sudden', 'suddenly', 'immediate', 'now', 'today', 'right now'],
      chronic: ['always', 'constantly', 'ongoing', 'persistent', 'chronic', 'for months', 'for years'],
      recurring: ['again', 'recurring', 'comes back', 'intermittent', 'on and off']
    };
  }

  isClinicallRelevant(text) {
    if (!text || typeof text !== 'string') return false;
    
    const lowerText = text.toLowerCase();
    
    // Check for clinical keywords
    const hasKeywords = this.clinicalKeywords.some(keyword => 
      lowerText.includes(keyword.toLowerCase())
    );

    // Additional heuristics
    const hasHealthPhrases = this.hasHealthPhrases(lowerText);
    const hasMedicalTerms = this.hasMedicalTerms(lowerText);
    
    return hasKeywords || hasHealthPhrases || hasMedicalTerms;
  }

  hasHealthPhrases(text) {
    const healthPhrases = [
      'feeling sick', 'not feeling well', 'under the weather',
      'doctor visit', 'medical appointment', 'health issue',
      'taking medication', 'prescription drug', 'side effects',
      'test results', 'lab results', 'blood work',
      'getting better', 'feeling worse', 'recovery',
      'health problem', 'medical condition', 'chronic pain'
    ];
    
    return healthPhrases.some(phrase => text.includes(phrase));
  }

  hasMedicalTerms(text) {
    const medicalTerms = [
      'mg', 'ml', 'dose', 'twice daily', 'once daily',
      'blood pressure', 'heart rate', 'temperature',
      'diagnosis', 'prognosis', 'treatment plan',
      'specialist', 'referral', 'follow-up'
    ];
    
    return medicalTerms.some(term => text.includes(term));
  }

  extractFindings(text) {
    if (!text || typeof text !== 'string') return [];
    
    const findings = [];
    const lowerText = text.toLowerCase();

    // Extract symptoms and conditions
    for (const [term, snomed] of Object.entries(this.snomedMappings)) {
      if (lowerText.includes(term)) {
        const finding = {
          term: term,
          display: snomed.display,
          code: snomed.code,
          system: 'http://snomed.info/sct',
          confidence: this.calculateConfidence(text, term),
          severity: this.determineSeverity(text, term),
          temporal: this.determineTemporal(text, term),
          context: this.extractContext(text, term)
        };
        
        findings.push(finding);
      }
    }

    // Extract medication mentions
    const medications = this.extractMedications(text);
    findings.push(...medications);

    // Extract vital signs or measurements
    const vitals = this.extractVitals(text);
    findings.push(...vitals);

    return findings.filter(finding => finding.confidence > 0.3);
  }

  calculateConfidence(text, term) {
    let confidence = 0.5; // Base confidence
    
    const lowerText = text.toLowerCase();
    
    // Increase confidence for exact matches
    if (lowerText.includes(` ${term} `) || lowerText.startsWith(`${term} `) || lowerText.endsWith(` ${term}`)) {
      confidence += 0.2;
    }
    
    // Increase confidence for context clues
    const contextClues = ['i have', 'i feel', 'experiencing', 'suffering from', 'diagnosed with'];
    if (contextClues.some(clue => lowerText.includes(clue))) {
      confidence += 0.2;
    }
    
    // Decrease confidence for negations
    const negations = ['no ', 'not ', 'without ', 'never ', 'don\'t have'];
    const termIndex = lowerText.indexOf(term);
    if (termIndex > 0) {
      const beforeTerm = lowerText.substring(Math.max(0, termIndex - 20), termIndex);
      if (negations.some(neg => beforeTerm.includes(neg))) {
        confidence -= 0.4;
      }
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  determineSeverity(text, term) {
    const lowerText = text.toLowerCase();
    
    for (const [level, indicators] of Object.entries(this.severityIndicators)) {
      if (indicators.some(indicator => lowerText.includes(indicator))) {
        return level;
      }
    }
    
    return 'unknown';
  }

  determineTemporal(text, term) {
    const lowerText = text.toLowerCase();
    
    for (const [pattern, indicators] of Object.entries(this.temporalIndicators)) {
      if (indicators.some(indicator => lowerText.includes(indicator))) {
        return pattern;
      }
    }
    
    return 'unknown';
  }

  extractContext(text, term) {
    const termIndex = text.toLowerCase().indexOf(term);
    if (termIndex === -1) return '';
    
    // Extract 50 characters before and after the term
    const start = Math.max(0, termIndex - 50);
    const end = Math.min(text.length, termIndex + term.length + 50);
    
    return text.substring(start, end).trim();
  }

  extractMedications(text) {
    const medications = [];
    const medicationPatterns = [
      /(\w+)\s+(\d+)\s*(mg|ml|g|mcg)/gi,
      /(taking|prescribed|on)\s+(\w+)/gi,
      /(\w+)\s+(tablet|pill|capsule|injection)/gi
    ];

    for (const pattern of medicationPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        medications.push({
          term: match[0],
          display: `Medication: ${match[0]}`,
          code: '410942007', // SNOMED: Drug or medicament
          system: 'http://snomed.info/sct',
          confidence: 0.7,
          type: 'medication',
          context: this.extractContext(text, match[0])
        });
      }
    }

    return medications;
  }

  extractVitals(text) {
    const vitals = [];
    const vitalPatterns = [
      /(\d+)\/(\d+)\s*(mmhg|blood pressure)/gi,
      /(\d+)\s*(bpm|beats per minute|heart rate)/gi,
      /(\d+\.?\d*)\s*(°f|°c|degrees|fever|temperature)/gi,
      /(\d+\.?\d*)\s*(lbs|kg|pounds|weight)/gi
    ];

    for (const pattern of vitalPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        vitals.push({
          term: match[0],
          display: `Vital Sign: ${match[0]}`,
          code: '72313002', // SNOMED: Vital signs
          system: 'http://snomed.info/sct',
          confidence: 0.8,
          type: 'vital-sign',
          context: this.extractContext(text, match[0])
        });
      }
    }

    return vitals;
  }

  // Method to get clinical summary statistics
  getClinicalSummary(findings) {
    const summary = {
      totalFindings: findings.length,
      highConfidence: findings.filter(f => f.confidence > 0.7).length,
      symptoms: findings.filter(f => f.type !== 'medication' && f.type !== 'vital-sign').length,
      medications: findings.filter(f => f.type === 'medication').length,
      vitals: findings.filter(f => f.type === 'vital-sign').length,
      severityDistribution: {
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
        unknown: findings.filter(f => f.severity === 'unknown').length
      }
    };

    return summary;
  }
}