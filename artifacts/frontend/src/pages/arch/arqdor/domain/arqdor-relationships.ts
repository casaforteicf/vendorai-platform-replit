import type { Relationship, RelationshipType, Project, ArchitecturalObject } from './arqdor-domain-types'

// ─── Labels ───────────────────────────────────────────────────────────────────

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  ABOVE:            'Acima de',
  BELOW:            'Abaixo de',
  NEXT_TO:          'Ao lado de',
  ALIGNED_WITH:     'Alinhado com',
  ATTACHED_TO:      'Fixado em',
  SAME_MATERIAL_AS: 'Mesmo material que',
  SAME_FINISH_AS:   'Mesmo acabamento que',
  SAME_HARDWARE_AS: 'Mesma ferragem que',
  PART_OF:          'Parte de',
  CONTAINS:         'Contém',
  SUPPORTS:         'Suporta',
  RELATED_TO:       'Relacionado com',
}

export const RELATIONSHIP_ICONS: Record<RelationshipType, string> = {
  ABOVE:            '⬆️',
  BELOW:            '⬇️',
  NEXT_TO:          '↔️',
  ALIGNED_WITH:     '⟺',
  ATTACHED_TO:      '🔗',
  SAME_MATERIAL_AS: '🎨',
  SAME_FINISH_AS:   '✨',
  SAME_HARDWARE_AS: '🔩',
  PART_OF:          '🧩',
  CONTAINS:         '📦',
  SUPPORTS:         '🏗️',
  RELATED_TO:       '🔄',
}

// ─── Factory ──────────────────────────────────────────────────────────────────

let _relId = 0

export function createRelationship(
  fromObjectId: string,
  toObjectId:   string,
  type:         RelationshipType,
  description = ''
): Relationship {
  return {
    id:           `rel-${++_relId}`,
    fromObjectId,
    toObjectId,
    type,
    description:  description || `${RELATIONSHIP_LABELS[type]}`,
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Returns all relationships where objectId is from OR to */
export function getObjectRelationships(objectId: string, project: Project): Relationship[] {
  const all: Relationship[] = []
  for (const env of project.environments) {
    for (const obj of env.architecturalObjects) {
      for (const rel of obj.relationships) {
        if (rel.fromObjectId === objectId || rel.toObjectId === objectId) {
          all.push(rel)
        }
      }
    }
  }
  // deduplicate by id
  return [...new Map(all.map(r => [r.id, r])).values()]
}

/** Returns the ArchitecturalObject instances related to objectId */
export function getRelatedObjects(objectId: string, project: Project): {
  object: ArchitecturalObject
  relationship: Relationship
  direction: 'outgoing' | 'incoming'
}[] {
  const rels   = getObjectRelationships(objectId, project)
  const lookup = buildObjectLookup(project)
  return rels.flatMap(rel => {
    const isOutgoing  = rel.fromObjectId === objectId
    const otherId     = isOutgoing ? rel.toObjectId : rel.fromObjectId
    const otherObject = lookup[otherId]
    if (!otherObject) return []
    return [{ object: otherObject, relationship: rel, direction: isOutgoing ? 'outgoing' : 'incoming' }]
  })
}

/** Flat lookup: id → ArchitecturalObject */
export function buildObjectLookup(project: Project): Record<string, ArchitecturalObject> {
  const map: Record<string, ArchitecturalObject> = {}
  for (const env of project.environments) {
    for (const obj of env.architecturalObjects) {
      map[obj.id] = obj
    }
  }
  return map
}

/** Get all objects in a project (flat) */
export function getAllObjects(project: Project): ArchitecturalObject[] {
  return project.environments.flatMap(e => e.architecturalObjects)
}

/** Get children of an object */
export function getChildren(objectId: string, project: Project): ArchitecturalObject[] {
  return getAllObjects(project).filter(o => o.parentId === objectId)
}
