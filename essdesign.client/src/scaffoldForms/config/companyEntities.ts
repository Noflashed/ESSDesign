// Derived from ESSApp/src/config/companyEntities.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import {Image, ImageSourcePropType} from '../browser/runtime';


export type CompanyEntityId = 'ess' | 'maloo';

export type CompanyEntity = {
  id: CompanyEntityId;
  shortName: string;
  projectEntityName: string;
  legalName: string;
  abn: string;
  officeAddress: string;
  phone: string;
  fax: string;
  logo: ImageSourcePropType;
};

const ESS_LOGO = {uri: '/scaffold-forms/logo.png'};
const MALOO_LOGO = {uri: '/scaffold-forms/maloo-logo.jpg'};
let malooLogoJpegBase64Promise: Promise<string> | null = null;

export const DEFAULT_COMPANY_ENTITY_ID: CompanyEntityId = 'ess';

export const COMPANY_ENTITIES: Record<CompanyEntityId, CompanyEntity> = {
  ess: {
    id: 'ess',
    shortName: 'ESS',
    projectEntityName: 'Erect Safe Scaffolding',
    legalName: 'Erect Safe Scaffolding (Sydney) Pty Ltd',
    abn: '46 602 486 957',
    officeAddress: '130 Gilba Road, Girraween NSW 2145',
    phone: '(02) 8818 3690',
    fax: '(02) 8818 3699',
    logo: ESS_LOGO,
  },
  maloo: {
    id: 'maloo',
    shortName: 'Maloo',
    projectEntityName: 'Maloo Access Group',
    legalName: 'Maloo Access Group Pty Ltd',
    abn: '96 677 198 300',
    officeAddress: '130 Gilba Road, Girraween NSW 2145',
    phone: '(02) 8818 3690',
    fax: '(02) 8818 3699',
    logo: MALOO_LOGO,
  },
};

export const COMPANY_ENTITY_OPTIONS = Object.values(COMPANY_ENTITIES);

export function normalizeCompanyEntityId(value?: string | null): CompanyEntityId {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'maloo' || normalized.includes('maloo access')) {
    return 'maloo';
  }
  return DEFAULT_COMPANY_ENTITY_ID;
}

export function getCompanyEntity(value?: string | null): CompanyEntity {
  return COMPANY_ENTITIES[normalizeCompanyEntityId(value)];
}

export function companyFormTitle(entityId: CompanyEntityId, formName: string): string {
  return `${COMPANY_ENTITIES[entityId].shortName} ${formName}`;
}

export function companyRepresentativeLabel(entityId: CompanyEntityId): string {
  return `${COMPANY_ENTITIES[entityId].shortName} REPRESENTATIVE`;
}

/** Reads the bundled JPEG for the custom PDF writers without using the network. */
export async function getCompanyLogoJpegBase64(
  entityId: CompanyEntityId,
  essLogoBase64: string,
): Promise<string> {
  if (entityId === 'ess') {
    return essLogoBase64;
  }

  if (!malooLogoJpegBase64Promise) {
    malooLogoJpegBase64Promise = (async () => {
      const response = await fetch((COMPANY_ENTITIES[entityId].logo as {uri: string}).uri);
      if (!response.ok) throw new Error('Unable to load the company logo.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    })().catch(error => {
      malooLogoJpegBase64Promise = null;
      throw error;
    });
  }

  return malooLogoJpegBase64Promise;
}
