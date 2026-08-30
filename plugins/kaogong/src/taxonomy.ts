/**
 * Curated knowledge-point taxonomy and error-reason vocabulary for the
 * 武汉市公务员考试 (行政职业能力测验 + 申论). No runtime dependencies.
 *
 * 归纳问题点 relies on canonical subject/knowledgePoint labels: recording a
 * question against these labels lets the analysis group errors by a stable
 * knowledge point instead of free-form text.
 * @module kaogong/taxonomy
 */

/** One knowledge-point node; `children` lists finer-grained sub-points. */
export interface TaxonomySection {
  /** 考点/知识点名. */
  name: string
  /** 下级考点（可选）. */
  children?: TaxonomySection[]
}

/** One exam subject/module with its knowledge-point tree. */
export interface TaxonomySubject {
  /** 科目/模块名. */
  subject: string
  /** 一级考点分类. */
  sections: TaxonomySection[]
}

/** 武汉公务员考试（行测 + 申论）考点大纲. */
export const TAXONOMY: TaxonomySubject[] = [
  {
    subject: '行测-言语理解与表达',
    sections: [
      { name: '逻辑填空' },
      {
        name: '片段阅读',
        children: [
          { name: '主旨概括' },
          { name: '意图判断' },
          { name: '细节理解' },
          { name: '标题填入' },
          { name: '词句理解' },
          { name: '态度观点' },
        ],
      },
      {
        name: '语句表达',
        children: [
          { name: '语句排序' },
          { name: '语句衔接' },
          { name: '病句辨析' },
        ],
      },
      { name: '文章阅读' },
    ],
  },
  {
    subject: '行测-数量关系',
    sections: [
      { name: '数字推理' },
      {
        name: '数学运算',
        children: [
          { name: '工程问题' },
          { name: '行程问题' },
          { name: '利润问题' },
          { name: '排列组合' },
          { name: '概率问题' },
          { name: '几何问题' },
          { name: '和差倍比' },
          { name: '年龄问题' },
          { name: '容斥问题' },
          { name: '浓度问题' },
          { name: '植树/方阵' },
          { name: '牛吃草' },
          { name: '日期/时钟' },
          { name: '最值/统筹' },
        ],
      },
    ],
  },
  {
    subject: '行测-判断推理',
    sections: [
      {
        name: '图形推理',
        children: [
          { name: '位置规律' },
          { name: '样式规律' },
          { name: '属性规律' },
          { name: '数量规律' },
          { name: '空间重构（立体图形）' },
          { name: '特殊规律' },
        ],
      },
      { name: '定义判断' },
      {
        name: '类比推理',
        children: [
          { name: '语义关系' },
          { name: '逻辑关系' },
          { name: '语法关系' },
          { name: '集合关系' },
          { name: '对应关系' },
        ],
      },
      {
        name: '逻辑判断',
        children: [
          { name: '翻译推理' },
          { name: '真假推理' },
          { name: '分析推理（组合排列）' },
          { name: '加强/削弱' },
          { name: '归纳推理' },
          { name: '日常结论' },
          { name: '原因解释' },
          { name: '前提假设' },
        ],
      },
    ],
  },
  {
    subject: '行测-资料分析',
    sections: [
      {
        name: '增长',
        children: [
          { name: '增长率' },
          { name: '增长量' },
          { name: '基期量' },
          { name: '现期量' },
          { name: '隔年增长' },
          { name: '年均增长' },
          { name: '混合增长' },
        ],
      },
      {
        name: '比重',
        children: [
          { name: '现期比重' },
          { name: '基期比重' },
          { name: '比重变化' },
        ],
      },
      {
        name: '平均数',
        children: [
          { name: '现期平均数' },
          { name: '基期平均数' },
          { name: '平均数变化' },
        ],
      },
      { name: '倍数与比值' },
      { name: '计算技巧（截位直除/特殊值）' },
    ],
  },
  {
    subject: '行测-常识判断',
    sections: [
      { name: '政治' },
      { name: '法律' },
      { name: '经济' },
      { name: '科技' },
      { name: '人文历史' },
      { name: '管理公文' },
    ],
  },
  {
    subject: '申论',
    sections: [
      { name: '归纳概括题' },
      { name: '综合分析题' },
      { name: '提出对策题' },
      { name: '贯彻执行题（公文写作）' },
      { name: '文章写作（大作文）' },
      { name: '材料理解' },
    ],
  },
]

/** 错因分类（记录错题时选择，也是归纳问题点的一个维度）. */
export const ERROR_REASONS = [
  '知识点不会',
  '概念混淆',
  '审题不清',
  '计算/分析失误',
  '粗心大意',
  '方法不当/技巧缺失',
  '时间不够',
  '记忆模糊',
  '其他',
] as const

/** Flatten the taxonomy into "subject | knowledgePoint" lines for display. */
export function renderTaxonomy(subject?: string): string {
  const lines: string[] = []
  for (const entry of TAXONOMY) {
    if (subject && entry.subject !== subject) continue
    lines.push(`## ${entry.subject}`)
    for (const section of entry.sections) {
      lines.push(`- ${section.name}`)
      for (const child of section.children ?? []) lines.push(`  - ${child.name}`)
    }
  }
  return lines.join('\n')
}

/** One flattened knowledge point (subject + canonical knowledge point). */
export interface KnowledgePointRef {
  subject: string
  knowledgePoint: string
}

/**
 * Flatten the taxonomy into subject → knowledge-point references. A section
 * with children yields one reference per child (named `section-child`, the
 * same spelling the notebook uses); a leaf section yields itself.
 * @returns the flattened list in taxonomy order.
 */
export function flattenTaxonomy(): KnowledgePointRef[] {
  const refs: KnowledgePointRef[] = []
  for (const entry of TAXONOMY) {
    for (const section of entry.sections) {
      if (section.children && section.children.length > 0) {
        for (const child of section.children) {
          refs.push({ subject: entry.subject, knowledgePoint: section.name + '-' + child.name })
        }
      } else {
        refs.push({ subject: entry.subject, knowledgePoint: section.name })
      }
    }
  }
  return refs
}
