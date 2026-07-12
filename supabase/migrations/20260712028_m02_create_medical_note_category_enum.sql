-- Epic C (#33): formalizes the three annotation types Modules-Features names
-- in prose and Process 5's flowchart, instead of leaving category as
-- unconstrained free text.

create type public.medical_note_category as enum ('Medical Note', 'Allergy', 'Behavioral Flag');
