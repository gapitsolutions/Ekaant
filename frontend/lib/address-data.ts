import { City, State } from "country-state-city";

const INDIA_COUNTRY_CODE = "IN";

export interface IndiaStateOption {
  code: string;
  name: string;
}

let statesCache: IndiaStateOption[] | null = null;
const citiesByStateCodeCache = new Map<string, string[]>();

export function getIndiaStates(): IndiaStateOption[] {
  if (statesCache) {
    return statesCache;
  }

  statesCache = State.getStatesOfCountry(INDIA_COUNTRY_CODE)
    .map((state) => ({
      code: state.isoCode,
      name: state.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return statesCache;
}

export function getIndiaStateCodeByName(stateName: string): string | null {
  const normalizedName = stateName.trim().toLowerCase();
  if (!normalizedName) {
    return null;
  }

  const state = getIndiaStates().find(
    (item) => item.name.toLowerCase() === normalizedName,
  );

  return state?.code ?? null;
}

export function getIndiaCitiesByStateCode(stateCode: string): string[] {
  const normalizedStateCode = stateCode.trim().toUpperCase();
  if (!normalizedStateCode) {
    return [];
  }

  const cached = citiesByStateCodeCache.get(normalizedStateCode);
  if (cached) {
    return cached;
  }

  const cityNames = Array.from(
    new Set(
      City.getCitiesOfState(INDIA_COUNTRY_CODE, normalizedStateCode)
        .map((city) => city.name)
        .filter((name) => Boolean(name?.trim())),
    ),
  ).sort((a, b) => a.localeCompare(b));

  citiesByStateCodeCache.set(normalizedStateCode, cityNames);
  return cityNames;
}

export function getIndiaCitiesByStateName(stateName: string): string[] {
  const stateCode = getIndiaStateCodeByName(stateName);
  if (!stateCode) {
    return [];
  }

  return getIndiaCitiesByStateCode(stateCode);
}
