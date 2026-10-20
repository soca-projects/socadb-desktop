--
-- PostgreSQL database dump
--

\restrict xPDBxui8Hsaf45NcC1OLuJJTKx3CAINoVII43t7bkR7s5YCLQuNKJF0Kj6atoM4

-- Dumped from database version 15.17 (Homebrew)
-- Dumped by pg_dump version 15.17 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: mood; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.mood AS ENUM (
    'happy',
    'it''s fine',
    'sad'
);


ALTER TYPE public.mood OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: people; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.people (
    id integer NOT NULL,
    legacy_id bigint NOT NULL,
    email character varying(200) NOT NULL,
    first_name text,
    last_name text,
    feeling public.mood DEFAULT 'happy'::public.mood,
    tags text[],
    price numeric(10,2) DEFAULT 0,
    ratio double precision,
    starts_at timestamp(3) with time zone DEFAULT now(),
    note_text character varying(40) DEFAULT 'it''s -- not a comment'::character varying,
    status character varying(20) DEFAULT 'draft'::character varying,
    full_name text GENERATED ALWAYS AS (((first_name || ' '::text) || last_name)) STORED,
    CONSTRAINT people_status_check CHECK (((status)::text <> ''::text))
);


ALTER TABLE public.people OWNER TO postgres;

--
-- Name: TABLE people; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.people IS 'Everyone; even ''quoted''.';


--
-- Name: COLUMN people.email; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.people.email IS 'Login e-mail';


--
-- Name: people_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.people ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.people_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: people_legacy_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.people_legacy_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.people_legacy_id_seq OWNER TO postgres;

--
-- Name: people_legacy_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.people_legacy_id_seq OWNED BY public.people.legacy_id;


--
-- Name: people legacy_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.people ALTER COLUMN legacy_id SET DEFAULT nextval('public.people_legacy_id_seq'::regclass);


--
-- Name: people people_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_name_unique UNIQUE (first_name, last_name);


--
-- Name: people people_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (id);


--
-- Name: people_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX people_active ON public.people USING btree (status) WHERE ((status)::text <> 'archived'::text);


--
-- Name: people_email_key2; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX people_email_key2 ON public.people USING btree (email);


--
-- Name: people_lower_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX people_lower_email ON public.people USING btree (lower((email)::text));


--
-- Name: people_tags_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX people_tags_gin ON public.people USING gin (tags);


--
-- PostgreSQL database dump complete
--

\unrestrict xPDBxui8Hsaf45NcC1OLuJJTKx3CAINoVII43t7bkR7s5YCLQuNKJF0Kj6atoM4

