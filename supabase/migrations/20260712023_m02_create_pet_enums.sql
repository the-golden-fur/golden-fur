-- Epic C (#32): pets is greenfield - no prior epic created it despite
-- Modules-Overview listing it as "Merged - Sprint 1". Enum values per
-- Modules-Features M02 Process 4's flowchart and Sprint1-EpicC-Design.xlsx.

create type public.pet_species as enum ('Dog', 'Cat');
create type public.pet_gender as enum ('Male', 'Female');
create type public.pet_weight_class as enum ('S', 'M', 'L', 'XL');
create type public.pet_coat_type as enum ('SC', 'LC');
