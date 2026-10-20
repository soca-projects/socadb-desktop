--
-- PostgreSQL database dump
--

\restrict Q2aijpzxOr2KLjx0UUNgCiX3KI92YTVCBBRS5gAyocl7fEhSAUHFVe3RaCaddIo

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
-- Name: loan_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.loan_status AS ENUM (
    'active',
    'it''s lost'
);


ALTER TYPE public.loan_status OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: loans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loans (
    member_id integer NOT NULL,
    status public.loan_status DEFAULT 'active'::public.loan_status NOT NULL,
    due_on date NOT NULL,
    fee numeric(10,2) NOT NULL,
    placed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    title character varying(120) DEFAULT 'it''s'::character varying NOT NULL
);


ALTER TABLE public.loans OWNER TO postgres;

--
-- Name: TABLE loans; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.loans IS 'One row per loan.';


--
-- Name: COLUMN loans.due_on; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.loans.due_on IS 'It''s due.';


--
-- Name: members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.members (
    id integer NOT NULL,
    role character varying(255) DEFAULT 'reader'::character varying NOT NULL,
    code character varying(36) DEFAULT (gen_random_uuid())::text NOT NULL
);


ALTER TABLE public.members OWNER TO postgres;

--
-- Name: members_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.members_id_seq OWNER TO postgres;

--
-- Name: members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.members_id_seq OWNED BY public.members.id;


--
-- Name: members id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members ALTER COLUMN id SET DEFAULT nextval('public.members_id_seq'::regclass);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: loan_title_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX loan_title_key ON public.loans USING btree (title);


--
-- Name: loans_member_id_due_on_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX loans_member_id_due_on_idx ON public.loans USING btree (member_id, due_on);


--
-- Name: loans_member_id_due_on_idx_2; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX loans_member_id_due_on_idx_2 ON public.loans USING btree (member_id, due_on);


--
-- Name: loans fk_loans_member_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT fk_loans_member_id FOREIGN KEY (member_id) REFERENCES public.members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Q2aijpzxOr2KLjx0UUNgCiX3KI92YTVCBBRS5gAyocl7fEhSAUHFVe3RaCaddIo

